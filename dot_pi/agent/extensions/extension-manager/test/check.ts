/** Run with just pi-check. Uses native discovery, settings persistence, and extension loading. */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const pkg = process.env.PI_PACKAGE!;
const load = (file: string) => import(pathToFileURL(path.join(pkg, file)).href);
const { loadExtensions } = await load("dist/core/extensions/loader.js");
const { DefaultPackageManager } = await load("dist/core/package-manager.js");
const { FileSettingsStorage, SettingsManager } = await load("dist/core/settings-manager.js");
const root = mkdtempSync(path.join(tmpdir(), "pi-extension-manager-"));
const agentDir = path.join(root, "agent");
const cwd = path.join(root, "project");
const settingsPath = path.join(agentDir, "settings.json");
const source = path.resolve(import.meta.dirname, "../index.ts");
const previousAgentDir = process.env.PI_CODING_AGENT_DIR;
process.env.PI_CODING_AGENT_DIR = agentDir;
const put = (file: string, content: string) => {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, content);
};
const json = (file: string, value: unknown) => put(file, JSON.stringify(value));
const read = (file = settingsPath) => JSON.parse(readFileSync(file, "utf8"));
const extension = (command: string) =>
  `export default pi => { pi.registerCommand(${JSON.stringify(command)}, {handler: async () => {}}); };`;
const alpha = path.join(agentDir, "extensions/alpha/index.ts");
const beta = path.join(cwd, ".pi/extensions/beta/index.ts");
const hook = path.join(root, ".claude/hooks/block-destructive-commands/pi.ts");
const packageDir = path.join(root, "package");
const packaged = path.join(packageDir, "one.ts");
const sibling = path.join(packageDir, "two.ts");
const duplicate = path.join(agentDir, "extensions/alpha.ts");
let reloads = 0;
let idleWaits = 0;
let confirmed = false;
let confirmationCount = 0;
let selected: string | undefined;
let throwReload = false;
let trusted = true;
const notices: string[] = [];
const ctx = {
  cwd,
  hasUI: true,
  isProjectTrusted: () => trusted,
  waitForIdle: async () => {
    idleWaits++;
  },
  reload: async () => {
    reloads++;
    if (throwReload) throw new Error("reload probe");
  },
  ui: {
    notify: (text: string) => notices.push(text),
    select: async (_title: string, choices: string[]) =>
      choices.find((choice) => choice.includes(selected ?? "NEVER_MATCH")),
    confirm: async () => {
      confirmationCount++;
      return confirmed;
    },
  },
};
const resolveResources = async () => {
  const settings = SettingsManager.create(cwd, agentDir, { projectTrusted: trusted });
  return (
    await new DefaultPackageManager({
      cwd,
      agentDir,
      settingsManager: settings,
      builtinExtensions: ["mcp", "codemode", "tool-search", "llama.cpp"],
    }).resolve(async () => "skip")
  ).extensions;
};
const isEnabled = async (file: string) =>
  (await resolveResources()).find((entry: any) => entry.path === file)?.enabled;

try {
  put(alpha, extension("alpha-command"));
  put(beta, extension("beta-command"));
  put(hook, extension("protected-command"));
  put(packaged, extension("one-command"));
  put(sibling, extension("two-command"));
  json(path.join(packageDir, "package.json"), { name: "fixture", pi: { extensions: ["*.ts"] } });
  json(settingsPath, {
    extensions: [source, hook],
    packages: [packageDir],
    marker: "keep",
    theme: "dark",
  });
  json(path.join(cwd, ".pi/settings.json"), { marker: "project" });
  const loaded = await loadExtensions([source], cwd);
  assert.deepEqual(loaded.errors, []);
  const manager = loaded.extensions[0];
  assert.equal(manager.tools.size, 0, "Do not add a model-callable management tool");
  const command = manager.commands.get("extensions");
  const run = async (args: string) => {
    notices.length = 0;
    await command.handler(args, ctx);
  };
  await manager.handlers.get("session_start")[0]({}, ctx);
  assert.ok(
    command
      .getArgumentCompletions("disable al")
      .some((item: any) => item.value === `disable ${alpha}`),
  );
  assert.equal(command.getArgumentCompletions("en")[0].value, "enable");
  await run("list");
  assert.ok(notices[0].includes("not runtime load status"));
  for (const name of ["alpha", "beta", "builtin:mcp", "block-destructive-commands", "one"])
    assert.ok(notices[0].includes(name));
  assert.equal(reloads, 0);
  for (const args of ["wat", "disable", "list extra", "enable missing"]) {
    await run(args);
    assert.equal(reloads, 0);
  }
  await run("disable alpha");
  assert.equal(await isEnabled(alpha), false);
  assert.equal(reloads, 1);
  assert.equal(read().marker, "keep");
  let runtime = await loadExtensions(
    (await resolveResources())
      .filter((entry: any) => entry.enabled && !entry.path.startsWith("builtin:"))
      .map((entry: any) => entry.path),
    cwd,
  );
  assert.deepEqual(runtime.errors, []);
  assert.ok(!runtime.extensions.some((entry: any) => entry.commands.has("alpha-command")));
  await run("enable alpha");
  assert.equal(await isEnabled(alpha), true);
  runtime = await loadExtensions([alpha], cwd);
  assert.ok(runtime.extensions[0].commands.has("alpha-command"));
  await run("enable alpha");
  assert.equal(reloads, 2, "Idempotent enable must not reload");
  await run("toggle alpha");
  assert.equal(await isEnabled(alpha), false);
  await run("toggle alpha");
  assert.equal(await isEnabled(alpha), true);
  await run("disable beta");
  assert.equal(await isEnabled(beta), false);
  assert.ok(read(path.join(cwd, ".pi/settings.json")).extensions.includes(`-${beta}`));
  assert.ok(!read().extensions.includes(`-${beta}`));
  await run("disable builtin:mcp");
  assert.equal(await isEnabled("builtin:mcp"), false);
  await run("enable builtin:mcp");
  assert.equal(await isEnabled("builtin:mcp"), true);
  const projectSettingsPath = path.join(cwd, ".pi/settings.json");
  const projectSettings = read(projectSettingsPath);
  json(projectSettingsPath, {
    ...projectSettings,
    extensions: [...projectSettings.extensions, "+builtin:mcp", alpha, `+${alpha}`],
  });
  const globalBeforeOverrides = readFileSync(settingsPath, "utf8");
  await run("disable builtin:mcp");
  await run(`disable ${alpha}`);
  assert.equal(await isEnabled("builtin:mcp"), false);
  assert.equal(await isEnabled(alpha), false);
  assert.equal(
    readFileSync(settingsPath, "utf8"),
    globalBeforeOverrides,
    "Existing project overrides must stay project-local",
  );
  json(projectSettingsPath, projectSettings);
  await run("disable one");
  assert.equal(await isEnabled(packaged), false);
  assert.equal(await isEnabled(sibling), true);
  await run("enable one");
  assert.equal(await isEnabled(packaged), true);
  const settings = read();
  settings.packages = [{ source: packageDir, extensions: [], skills: [] }];
  json(settingsPath, settings);
  await run("enable one");
  assert.equal(await isEnabled(packaged), true);
  assert.equal(
    await isEnabled(sibling),
    false,
    "Enabling one item must not enable siblings from an empty filter",
  );
  assert.deepEqual(read().packages[0].skills, []);
  json(projectSettingsPath, {
    ...projectSettings,
    packages: [{ source: packageDir, autoload: false, extensions: ["-one.ts"] }],
  });
  const globalBeforeDelta = readFileSync(settingsPath, "utf8");
  await run("enable one");
  assert.equal(await isEnabled(packaged), true);
  assert.equal(await isEnabled(sibling), false);
  assert.equal(
    readFileSync(settingsPath, "utf8"),
    globalBeforeDelta,
    "Existing package deltas must stay project-local",
  );
  json(projectSettingsPath, projectSettings);
  const beforeProtected = reloads;
  await run(`disable ${source}`);
  assert.ok(notices[0].includes("cannot disable itself"));
  await run("disable block-destructive-commands");
  assert.equal(confirmationCount, 1);
  assert.equal(reloads, beforeProtected);
  assert.equal(await isEnabled(hook), true);
  confirmed = true;
  await run("disable block-destructive-commands");
  assert.equal(await isEnabled(hook), false);
  assert.equal(reloads, beforeProtected + 1);
  put(duplicate, extension("duplicate"));
  await run("disable alpha");
  assert.ok(notices[0].includes("Ambiguous"));
  await run(`disable ${duplicate}`);
  assert.equal(await isEnabled(duplicate), false);
  const beforeCancel = reloads;
  await run("");
  assert.equal(reloads, beforeCancel, "Cancel must not change settings");
  selected = `  ${alpha}`;
  await run("");
  assert.equal(await isEnabled(alpha), false);
  trusted = false;
  await run("list");
  assert.ok(!notices[0].includes(beta), "Untrusted project resources must not be read");
  trusted = true;
  const valid = readFileSync(settingsPath, "utf8");
  put(settingsPath, "{broken");
  const beforeError = reloads;
  await run(`enable ${alpha}`);
  assert.equal(reloads, beforeError);
  assert.equal(readFileSync(settingsPath, "utf8"), "{broken");
  put(settingsPath, valid);
  const withLock = FileSettingsStorage.prototype.withLock;
  FileSettingsStorage.prototype.withLock = function (
    scope: string,
    fn: (current: string | undefined) => string | undefined,
  ) {
    return withLock.call(this, scope, (current: string | undefined) => {
      const next = fn(current);
      if (next !== undefined) throw new Error("write probe");
      return next;
    });
  };
  try {
    await run(`enable ${alpha}`);
    assert.equal(reloads, beforeError, "Write failures must not reload");
    assert.equal(readFileSync(settingsPath, "utf8"), valid);
    assert.ok(notices.at(-1)!.includes("write probe"));
  } finally {
    FileSettingsStorage.prototype.withLock = withLock;
  }
  throwReload = true;
  await run(`enable ${alpha}`);
  assert.equal(await isEnabled(alpha), true);
  assert.ok(notices.at(-1)!.includes("Settings saved, but reload failed"));
  assert.ok(idleWaits > reloads);

  const modify = path.resolve(import.meta.dirname, "../../../modify_settings.json");
  const apply = (input: string) => spawnSync("sh", [modify], { input, encoding: "utf8" });
  const initial = apply("");
  assert.equal(initial.status, 0, initial.stderr);
  const baseline = JSON.parse(initial.stdout);
  baseline.extensions.push("-builtin:mcp", `-${alpha}`, "+builtin:codemode");
  baseline.packages[0] = { source: baseline.packages[0], extensions: ["-index.ts"], skills: [] };
  baseline.deviceId = "keep";
  const applied = apply(JSON.stringify(baseline));
  assert.equal(applied.status, 0, applied.stderr);
  assert.deepEqual(
    JSON.parse(applied.stdout),
    baseline,
    "Apply must retain native switches and package filters",
  );
  assert.equal(apply(applied.stdout).stdout, applied.stdout, "Apply must be idempotent");
  assert.notEqual(apply("{broken").status, 0, "Malformed settings must not be replaced");
  console.log(
    "extension-manager: discovery, scopes, native filters, commands, protection, errors, loading, and chezmoi persistence passed",
  );
} finally {
  if (previousAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
  else process.env.PI_CODING_AGENT_DIR = previousAgentDir;
  rmSync(root, { recursive: true, force: true });
}
