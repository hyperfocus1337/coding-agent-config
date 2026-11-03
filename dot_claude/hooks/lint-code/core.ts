/** Lints changed and untracked source files once at the stop boundary. */

export interface Io {
  /** Whether the path is a regular file; undefined if missing. */
  stat(path: string): Promise<{ isFile: boolean } | undefined>;
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

/** Checks the repository that holds cwd; returns all lint failures together. */
export async function check(cwd: string, io: Io, settings: Settings): Promise<string | undefined> {
  if ((settings.hooksOff ?? "").split(/[\s,]+/).includes("lint-code")) return;
  const top = await io.run(["git", "rev-parse", "--show-toplevel"], { cwd });
  if (top?.exitCode !== 0) return;
  const root = top.output.replace(/\n$/, "");
  const run: Io["run"] = (argv, options) => io.run(argv, { cwd: options?.cwd ?? root });
  const off = await run(["git", "config", "--type=bool", "--get", "agent-hook.lint-code.enabled"]);
  if (off?.output.trim() === "false") return;
  const git = async (...args: string[]) => {
    const ran = await run(["git", ...args]);
    return ran?.exitCode === 0 ? ran.output.split("\0").filter(Boolean) : [];
  };
  // shortcut: git includes edits from before this session. Track transcript
  // paths instead if checks must exclude pre-existing uncommitted work.
  const changed = new Set([
    ...(await git("diff", "--name-only", "-z", "--diff-filter=d", "HEAD")),
    ...(await git("ls-files", "-z", "--others", "--exclude-standard")),
  ]);
  const tmpdir = settings.tmpdir?.replace(/^\/private/, "").replace(/\/$/, "");
  const files: string[] = [];
  for (const name of changed) {
    if (!/\.(?:py|jsx?|tsx?|mjs|cjs|mts|cts|sh|bash|ya?ml|tf)$/.test(name)) continue;
    const file = `${root}/${name}`;
    const plain = file.replace(/^\/private/, "");
    if (/^\/(var\/)?tmp\//.test(plain) || (tmpdir && plain.startsWith(`${tmpdir}/`))) continue;
    if ((await io.stat(file))?.isFile) files.push(file);
  }
  const output = await lint(files, { ...io, run }, settings);
  if (output === undefined) return;
  return `Lint errors:\n${output}\nFix the lint errors, rerun the relevant checks, then stop. Report any remaining failures.\n`;
}

/**
 * Ansible YAML, by path, by entry-point name, or by content. ansible-lint
 * only runs on these; other YAML goes to yamllint.
 */
async function isAnsible(file: string, io: Io): Promise<boolean> {
  return (
    /\/(roles|tasks|handlers|playbooks|group_vars|host_vars|molecule)\//.test(file) ||
    /(^|\/)(site|playbook|main|requirements)\.ya?ml$/.test(file) ||
    /^\s*(- )?(hosts|tasks|roles|ansible\.builtin\.):/m.test(await io.read(file).catch(() => ""))
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
      return disabled("py") ? undefined : { argv: ["ruff", "check", "--quiet", file] };
    case "js":
    case "jsx":
    case "ts":
    case "tsx":
    case "mjs":
    case "cjs":
    case "mts":
    case "cts":
      return disabled("js") ? undefined : { argv: ["oxlint", "--deny-warnings", file] };
    case "sh":
    case "bash":
      return disabled("sh") ? undefined : { argv: ["shellcheck", "-S", "warning", file] };
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
      const own = (await io.stat(`${dir}/.tflint.hcl`)) ?? (await io.stat(`${dir}/.tflint.json`));
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
