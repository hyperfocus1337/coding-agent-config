/** Extend unqualified @ searches to the Git root and user-configured folders. */
import * as fs from "node:fs";
import * as path from "node:path";
import { getAgentDir, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { CombinedAutocompleteProvider } from "@earendil-works/pi-tui";
import { extendSearch, extraRoots, searchRoots } from "./search.ts";

export default function fileSearch(pi: ExtensionAPI): void {
  let enabled = true;
  let available = false;
  pi.registerCommand("file-search", {
    description: "Toggle extended file search, or use on, off, or status",
    handler: async (args, ctx) => {
      const action = args.trim().toLowerCase();
      if (!["", "on", "off", "status"].includes(action)) {
        ctx.ui.notify("Usage: /file-search [on|off|status]", "warning");
        return;
      }
      if (ctx.mode !== "tui" || process.env.PI_FILE_SEARCH === "0") {
        ctx.ui.notify(
          "File search is unavailable outside TUI mode or with PI_FILE_SEARCH=0",
          "warning",
        );
        return;
      }
      if (action !== "status") enabled = action ? action === "on" : !enabled;
      const detail = !enabled
        ? "native search and display"
        : available
          ? "repository search and single-column paths"
          : "no broader search roots available; using native completion";
      ctx.ui.notify(`File search: ${enabled ? "on" : "off"} (${detail})`, "info");
    },
  });
  pi.on("session_start", async (_event, ctx) => {
    enabled = true;
    available = false;
    if (ctx.mode !== "tui" || process.env.PI_FILE_SEARCH === "0") return;
    const warn = (message: string) => ctx.ui.notify(`File search: ${message}`, "warning");
    const cwd = fs.realpathSync(ctx.cwd);
    const roots: string[] = [];
    try {
      const git = await pi.exec("git", ["-C", cwd, "rev-parse", "--show-toplevel"], {
        timeout: 2000,
      });
      if (git.code === 0) roots.push(git.stdout.replace(/\r?\n$/, ""));
    } catch {
      // Outside Git, keep working-folder completion and any configured folders.
    }
    const configPath = path.join(getAgentDir(), "file-search.json");
    try {
      const config: unknown = JSON.parse(fs.readFileSync(configPath, "utf8"));
      const configuredRoots = extraRoots(config);
      const startup = (config as { defaultEnabled?: unknown }).defaultEnabled;
      if (startup !== undefined && typeof startup !== "boolean") {
        throw new Error("defaultEnabled must be a boolean");
      }
      enabled = startup ?? true;
      roots.push(...configuredRoots);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        warn(`${configPath}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    const resolved = searchRoots(cwd, roots, warn);
    if (!resolved.length) return;
    let fd: string | undefined;
    const managed = path.join(getAgentDir(), "bin", process.platform === "win32" ? "fd.exe" : "fd");
    for (const candidate of [managed, "fd", "fdfind"]) {
      try {
        if ((await pi.exec(candidate, ["--version"], { timeout: 2000 })).code === 0) {
          fd = candidate;
          break;
        }
      } catch {
        // Try the next managed or system executable; never download a binary here.
      }
    }
    if (!fd) {
      warn("fd is unavailable; keeping built-in completion only");
      return;
    }
    const sources = resolved.map((root) => ({
      root,
      provider: new CombinedAutocompleteProvider([], root, fd),
    }));
    ctx.ui.addAutocompleteProvider((current) => {
      const provider = extendSearch(current, cwd, sources);
      return {
        ...provider,
        async getSuggestions(...args) {
          if (!enabled) return current.getSuggestions(...args);
          const result = await provider.getSuggestions(...args);
          if (!enabled) return current.getSuggestions(...args);
          if (!result?.prefix.startsWith("@")) return result;
          return {
            ...result,
            items: result.items.map(({ description, ...item }) => ({
              ...item,
              label: description
                ? description + (item.label.endsWith("/") && !description.endsWith("/") ? "/" : "")
                : item.label,
            })),
          };
        },
      };
    });
    available = true;
  });
}
