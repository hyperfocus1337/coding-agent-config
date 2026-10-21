/**
 * The lint-code logic: finds the files a tool call changed and lints
 * each by its extension. The adapters pass in the file and process functions,
 * because a mod reaches them only through `$`.
 *
 * Adapters: hooks/register.ts (Claude Code mod), pi.ts and omp.ts (pi and
 * omp), command.ts (Codex command hook).
 */

export interface Io {
  /** Whether the path is a regular file, and its mtime; undefined if missing. */
  stat(path: string): Promise<{ isFile: boolean; mtimeMs: number } | undefined>;
  read(path: string): Promise<string>;
  /** The exit code and output; undefined when the program cannot start. */
  run(
    argv: string[],
  ): Promise<{ exitCode: number; output: string } | undefined>;
}

export interface Settings {
  /** The folder of the bundled .yamllint and .ansible-lint. */
  configDir: string;
  /** CLAUDE_LINT_DISABLE: keys (py js sh yaml) or "all", space or comma. */
  disable?: string;
  /** TMPDIR: files under it are throwaway and not linted. */
  tmpdir?: string;
  /** AGENT_HOOKS_DISABLE: the hooks /toggle-hook turned off. */
  hooksOff?: string;
}

/**
 * The tool call: a Write or Edit names a file, a Bash call a command. A
 * relative path resolves against cwd.
 */
export interface Call {
  filePath?: string;
  command?: string;
  cwd: string;
}

/** A path a Bash command names, by the extensions this hook lints. */
const NAMED =
  /[^\s:;|&"'`()<>=]+\.(?:py|jsx?|tsx?|mjs|cjs|mts|cts|sh|bash|ya?ml)\b/g;

/**
 * The files to lint. A Write or Edit: the one file it names. A Bash call: the
 * paths its command names that it just wrote, by an mtime of at most 120 s.
 * A path the command only read is not linted, so `cat app.py` never blocks
 * on an error that was already there. shortcut: a command that writes early
 * and then runs for minutes falls outside the window. The upgrade is a start
 * time stamped before the call.
 */
export async function targets(
  call: Call,
  io: Io,
  settings: Settings,
  now = Date.now(),
): Promise<string[]> {
  if ((settings.hooksOff ?? "").split(/[\s,]+/).includes("lint-code"))
    return [];
  const named = call.filePath
    ? [call.filePath]
    : [...(call.command ?? "").matchAll(NAMED)].map(([path]) => path);
  // Scratch and temp files are not project code. macOS resolves /tmp to
  // /private/tmp, so both sides drop that prefix.
  const tmpdir = (settings.tmpdir || "/nonexistent").replace(/^\/private/, "");
  const kept = new Set<string>();
  for (const path of named) {
    const file = path.startsWith("/") ? path : `${call.cwd}/${path}`;
    const plain = file.replace(/^\/private/, "");
    if (/^\/(var\/)?tmp\//.test(plain) || plain.startsWith(tmpdir)) continue;
    const stat = await io.stat(file);
    if (stat?.isFile && (call.filePath || now - stat.mtimeMs <= 120_000))
      kept.add(file);
  }
  return [...kept];
}

/**
 * Ansible YAML, by path, by entry-point name, or by content. ansible-lint
 * only runs on these; other YAML goes to yamllint.
 */
async function isAnsible(file: string, io: Io): Promise<boolean> {
  return (
    /\/(roles|tasks|handlers|playbooks|group_vars|host_vars|molecule)\//.test(
      file,
    ) ||
    /(^|\/)(site|playbook|main|requirements)\.ya?ml$/.test(file) ||
    /^\s*(- )?(hosts|tasks|roles|ansible\.builtin\.):/m.test(
      await io.read(file).catch(() => ""),
    )
  );
}

/** The linter for a file, or undefined when its key is disabled. */
async function linter(file: string, io: Io, settings: Settings) {
  const off = (settings.disable ?? "").split(/[ ,]+/);
  const disabled = (key: string) => off.includes("all") || off.includes(key);
  const config = settings.configDir;
  switch (file.split(".").pop()) {
    case "py":
      return disabled("py") ? undefined : ["ruff", "check", "--quiet", file];
    case "js":
    case "jsx":
    case "ts":
    case "tsx":
    case "mjs":
    case "cjs":
    case "mts":
    case "cts":
      return disabled("js") ? undefined : ["oxlint", "--deny-warnings", file];
    case "sh":
    case "bash":
      return disabled("sh") ? undefined : ["shellcheck", "-S", "warning", file];
    case "yml":
    case "yaml":
      if (disabled("yaml")) return undefined;
      return (await isAnsible(file, io))
        ? ["ansible-lint", "-c", `${config}/.ansible-lint`, "-q", file]
        : ["yamllint", "-c", `${config}/.yamllint`, file];
  }
  return undefined;
}

/**
 * Lints every target, so one Bash call reports every file it wrote. Returns
 * the output of all linters when one failed, else undefined. A missing
 * linter skips its file.
 */
export async function lint(
  files: string[],
  io: Io,
  settings: Settings,
): Promise<string | undefined> {
  let failed = false;
  let output = "";
  for (const file of files) {
    const argv = await linter(file, io, settings);
    const ran = argv && (await io.run(argv));
    if (!ran) continue;
    output += ran.output;
    if (ran.exitCode !== 0) failed = true;
  }
  return failed ? output : undefined;
}
