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
  /**
   * The exit code and output; undefined when the program cannot start. Runs
   * in `cwd` when given, else in the session folder.
   */
  run(
    argv: string[],
    options?: { cwd?: string },
  ): Promise<{ exitCode: number; output: string } | undefined>;
}

export interface Settings {
  /** The folder of the bundled .yamllint, .ansible-lint, and .tflint.hcl. */
  configDir: string;
  /** CLAUDE_LINT_DISABLE: keys (py js sh yaml tf) or "all", space or comma. */
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
  /[^\s:;|&"'`()<>=]+\.(?:py|jsx?|tsx?|mjs|cjs|mts|cts|sh|bash|ya?ml|tf)\b/g;

/**
 * Whether the git config of the repository that holds `dir` sets
 * agent-hook.lint-code.enabled to false, as /toggle-hook --repo does.
 * Outside git, a missing key, or a value that is not a boolean: false. -C,
 * because `run` runs in the session folder.
 */
async function repoOff(dir: string, io: Io): Promise<boolean> {
  const key = "agent-hook.lint-code.enabled";
  const ran = await io.run([
    "git",
    "-C",
    dir,
    "config",
    "--type=bool",
    "--get",
    key,
  ]);
  return ran?.output.trim() === "false";
}

/**
 * The files to lint. A Write or Edit: the one file it names. A Bash call: the
 * paths its command names that it just wrote, by an mtime of at most 120 s.
 * A path the command only read is not linted, so `cat app.py` never blocks
 * on an error that was already there. A file whose repository turns off the
 * hook is not linted. shortcut: a command that writes early and then runs
 * for minutes falls outside the window. The upgrade is a start time stamped
 * before the call.
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
  // One git run for each folder.
  const asked = new Map<string, Promise<boolean>>();
  for (const path of named) {
    const file = path.startsWith("/") ? path : `${call.cwd}/${path}`;
    const plain = file.replace(/^\/private/, "");
    if (/^\/(var\/)?tmp\//.test(plain) || plain.startsWith(tmpdir)) continue;
    const stat = await io.stat(file);
    if (!stat?.isFile || (!call.filePath && now - stat.mtimeMs > 120_000))
      continue;
    const dir = file.slice(0, file.lastIndexOf("/")) || "/";
    if (!asked.has(dir)) asked.set(dir, repoOff(dir, io));
    if (!(await asked.get(dir))) kept.add(file);
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

/**
 * The linter for a file and the folder to run it in, or undefined when its
 * key is disabled.
 */
async function linter(
  file: string,
  io: Io,
  settings: Settings,
): Promise<{ argv: string[]; cwd?: string } | undefined> {
  const off = (settings.disable ?? "").split(/[ ,]+/);
  const disabled = (key: string) => off.includes("all") || off.includes(key);
  const config = settings.configDir;
  switch (file.split(".").pop()) {
    case "py":
      return disabled("py")
        ? undefined
        : { argv: ["ruff", "check", "--quiet", file] };
    case "js":
    case "jsx":
    case "ts":
    case "tsx":
    case "mjs":
    case "cjs":
    case "mts":
    case "cts":
      return disabled("js")
        ? undefined
        : { argv: ["oxlint", "--deny-warnings", file] };
    case "sh":
    case "bash":
      return disabled("sh")
        ? undefined
        : { argv: ["shellcheck", "-S", "warning", file] };
    case "yml":
    case "yaml":
      if (disabled("yaml")) return undefined;
      return {
        argv: (await isAnsible(file, io))
          ? ["ansible-lint", "-c", `${config}/.ansible-lint`, "-q", file]
          : ["yamllint", "-c", `${config}/.yamllint`, file],
      };
    case "tf": {
      if (disabled("tf")) return undefined;
      // tflint lints a whole module, so it runs in the folder of the file,
      // and --filter keeps the issues of this file. With --chdir, --filter
      // matches nothing (tflint 0.64.0). A .tflint.hcl or .tflint.json of
      // the module wins over the bundled config.
      const slash = file.lastIndexOf("/");
      const dir = file.slice(0, slash) || "/";
      const own =
        (await io.stat(`${dir}/.tflint.hcl`)) ??
        (await io.stat(`${dir}/.tflint.json`));
      return {
        argv: [
          "tflint",
          ...(own ? [] : [`--config=${config}/.tflint.hcl`]),
          `--filter=${file.slice(slash + 1)}`,
          "--format=compact",
          "--no-color",
        ],
        cwd: dir,
      };
    }
  }
  return undefined;
}

/** tflint output for a plugin that `tflint --init` did not install. */
const TFLINT_PLUGIN_MISSING = /Did you run "tflint --init"\?/;
/** Output of a mise shim of any linter that has no version set. */
const MISE_SHIM_VERSION_MISSING = /No version is set for shim/;

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
    const found = await linter(file, io, settings);
    const ran = found && (await io.run(found.argv, { cwd: found.cwd }));
    // Not a lint error: the linter or its plugin is missing.
    if (
      !ran ||
      TFLINT_PLUGIN_MISSING.test(ran.output) ||
      MISE_SHIM_VERSION_MISSING.test(ran.output)
    )
      continue;
    output += ran.output;
    if (ran.exitCode !== 0) failed = true;
  }
  return failed ? output : undefined;
}
