/** Manage native extension settings, then replace the runtime through Pi's reload flow. */
import { realpathSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  CONFIG_DIR_NAME,
  getAgentDir,
  getPackageDir,
  SettingsManager,
  type ExtensionAPI,
  type PackageManager,
  type ResolvedResource,
} from "@earendil-works/pi-coding-agent";

const actions = ["list", "enable", "disable", "toggle"];
const usage = "/extensions [list | enable <name> | disable <name> | toggle <name>]";

export function nameOf(resource: ResolvedResource): string {
  if (resource.path.startsWith("builtin:")) return resource.path;
  const file = basename(resource.path);
  return file === "pi.ts" || file === "index.ts" || file === "index.js"
    ? basename(dirname(resource.path))
    : basename(file, extname(file));
}

function target(entry: string): string {
  return /^[!+-]/.test(entry) ? entry.slice(1) : entry;
}

function absolute(path: string, base: string): string {
  if (path.startsWith("builtin:")) return path;
  return resolve(base, path.startsWith("~/") ? join(homedir(), path.slice(2)) : path);
}

export function setEnabled(
  settings: SettingsManager,
  resource: ResolvedResource,
  enabled: boolean,
  cwd: string,
  agentDir: string,
): void {
  const project = resource.metadata.scope === "project";
  const current = project ? settings.getProjectSettings() : settings.getGlobalSettings();
  const base = project ? join(cwd, CONFIG_DIR_NAME) : agentDir;
  if (resource.metadata.origin === "package") {
    const packages = [...(current.packages ?? [])];
    const index = packages.findIndex(
      (pkg) => (typeof pkg === "string" ? pkg : pkg.source) === resource.metadata.source,
    );
    if (index < 0 || !resource.metadata.baseDir) {
      throw new Error("Cannot find the owning package settings.");
    }
    const entry = packages[index];
    const pkg = typeof entry === "string" ? { source: entry } : { ...entry };
    const pattern = relative(resource.metadata.baseDir, resource.path);
    // An empty package filter means none, not all; keep that meaning for sibling resources.
    const filters =
      pkg.autoload !== false && pkg.extensions?.length === 0 ? ["!**"] : (pkg.extensions ?? []);
    pkg.extensions = filters.filter((entry) => target(entry) !== pattern);
    pkg.extensions.push(`${enabled ? "+" : "-"}${pattern}`);
    packages[index] = pkg;
    if (project) settings.setProjectPackages(packages);
    else settings.setPackages(packages);
  } else {
    const paths = (current.extensions ?? []).filter(
      (entry) => !/^[!+-]/.test(entry) || absolute(target(entry), base) !== resource.path,
    );
    // Keep plain declarations so disabled external files remain discoverable for re-enabling.
    paths.push(`${enabled ? "+" : "-"}${resource.path}`);
    if (project) settings.setProjectExtensionPaths(paths);
    else settings.setExtensionPaths(paths);
  }
}

function checkErrors(settings: SettingsManager): void {
  const errors = settings.drainErrors();
  if (errors.length) throw new Error(errors.map(({ error }) => error.message).join("; "));
}

export default function (pi: ExtensionAPI) {
  let completionResources: ResolvedResource[] = [];
  const self = realpathSync(fileURLToPath(import.meta.url));

  async function discover(cwd: string, trusted: boolean) {
    const agentDir = getAgentDir();
    const settings = SettingsManager.create(cwd, agentDir, { projectTrusted: trusted });
    checkErrors(settings);
    // shortcut: Pi exposes discovery only internally, upgrade when a public resource API exists.
    const load = (file: string) => import(pathToFileURL(join(getPackageDir(), "dist", file)).href);
    const { DefaultPackageManager } = await load("core/package-manager.js");
    const { builtInExtensions } = await load("extensions/index.js");
    const manager: PackageManager = new DefaultPackageManager({
      cwd,
      agentDir,
      settingsManager: settings,
      builtinExtensions: builtInExtensions.map((extension: { name: string }) => extension.name),
    });
    const resolved = await manager.resolve(async () => "skip");
    completionResources = resolved.extensions.sort((a, b) => nameOf(a).localeCompare(nameOf(b)));
    return {
      settings,
      agentDir,
      resources: completionResources,
      failures: resolved.installFailures,
    };
  }

  pi.on("session_start", async (_event, ctx) => {
    try {
      await discover(ctx.cwd, ctx.isProjectTrusted());
    } catch (error) {
      if (ctx.hasUI) ctx.ui.notify(`Extension discovery failed: ${error}`, "error");
    }
  });

  pi.registerCommand("extensions", {
    description: "List, enable, disable, or toggle configured extensions; changes reload Pi",
    getArgumentCompletions(prefix) {
      const match = prefix.match(/^(enable|disable|toggle)\s+(.*)$/);
      if (!match)
        return actions
          .filter((action) => action.startsWith(prefix))
          .map((value) => ({ value, label: value }));
      return completionResources
        .filter(
          (resource) => resource.path.startsWith(match[2]) || nameOf(resource).startsWith(match[2]),
        )
        .map((resource) => ({
          value: `${match[1]} ${resource.path}`,
          label: `${nameOf(resource)} [${resource.metadata.scope}]`,
          description: resource.path,
        }));
    },
    handler: async (args, ctx) => {
      if (!ctx.hasUI) return;
      try {
        const match = args.trim().match(/^(list|enable|disable|toggle)(?:\s+(.+))?$/);
        if (args.trim() && (!match || (match[1] === "list" ? match[2] : !match[2]))) {
          ctx.ui.notify(usage, "error");
          return;
        }
        await ctx.waitForIdle();
        const { settings, agentDir, resources, failures } = await discover(
          ctx.cwd,
          ctx.isProjectTrusted(),
        );
        for (const failure of failures ?? []) {
          ctx.ui.notify(`Package unavailable: ${failure.source}: ${failure.message}`, "warning");
        }
        const label = (resource: ResolvedResource) =>
          `${resource.enabled ? "on " : "off"}  ${nameOf(resource)}  [${resource.metadata.scope}]  ${resource.path}`;
        if (match?.[1] === "list") {
          ctx.ui.notify(
            `Configured extensions (not runtime load status):\n${resources.map(label).join("\n")}`,
            "info",
          );
          return;
        }
        let resource: ResolvedResource | undefined;
        if (!match) {
          const choice = await ctx.ui.select(
            "Toggle extension (saves settings and reloads Pi)",
            resources.map(label),
          );
          if (choice === undefined) return;
          resource = resources.find((resource) => label(resource) === choice);
        } else {
          const matches = resources.filter(
            (resource) => resource.path === match[2] || nameOf(resource) === match[2],
          );
          if (matches.length !== 1) {
            ctx.ui.notify(
              matches.length
                ? `Ambiguous name; use an exact path:\n${matches.map(label).join("\n")}`
                : `Unknown extension: ${match[2]}`,
              "error",
            );
            return;
          }
          resource = matches[0];
        }
        if (!resource) return;
        const enabled =
          match?.[1] === "enable" ? true : match?.[1] === "disable" ? false : !resource.enabled;
        if (
          !enabled &&
          !resource.path.startsWith("builtin:") &&
          realpathSync(resource.path) === self
        ) {
          ctx.ui.notify("The extension manager cannot disable itself.", "error");
          return;
        }
        if (enabled === resource.enabled) {
          ctx.ui.notify(
            `${nameOf(resource)} is already configured ${enabled ? "on" : "off"}. Use /reload to retry loading.`,
            "info",
          );
          return;
        }
        if (!enabled && /[/\\]\.claude[/\\]hooks[/\\]/.test(resource.path)) {
          if (
            !(await ctx.ui.confirm(
              "Disable hook?",
              `${resource.path}\nThis removes the hook, including any command protection it provides, from future sessions in this scope.`,
            ))
          )
            return;
        }
        await ctx.waitForIdle();
        await settings.reload();
        checkErrors(settings);
        setEnabled(settings, resource, enabled, ctx.cwd, agentDir);
        await settings.flush();
        checkErrors(settings);
        ctx.ui.notify(
          `Saved ${nameOf(resource)}: ${enabled ? "on" : "off"} (${resource.metadata.scope}). Reloading Pi.`,
          "info",
        );
      } catch (error) {
        ctx.ui.notify(`Extension change failed; runtime not reloaded: ${error}`, "error");
        return;
      }
      try {
        await ctx.reload();
        return;
      } catch (error) {
        ctx.ui.notify(`Settings saved, but reload failed: ${error}. Retry /reload.`, "error");
      }
    },
  });
}
