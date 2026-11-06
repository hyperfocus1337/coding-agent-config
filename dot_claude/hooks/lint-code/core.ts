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
  /** Explicit repository check, including clean tracked files; skips are failures. */
  all?: boolean;
  /** Final report only, with no request for another correction. */
  verify?: boolean;
  /** Repository boundary for configuration discovery. Set by check. */
  root?: string;
  /** Non-blocking coverage notices, deduplicated by lint. */
  notice?: (message: string) => void;
}

/** Checks the repository that holds cwd; returns all lint failures together. */
export async function check(cwd: string, io: Io, settings: Settings): Promise<string | undefined> {
  if (!settings.all && (settings.hooksOff ?? "").split(/[\s,]+/).includes("lint-code")) return;
  const top = await io.run(["git", "rev-parse", "--show-toplevel"], { cwd });
  if (!top || top.exitCode < 0) {
    const message = `Lint coverage incomplete: git: ${top?.output || "could not start"}`;
    settings.notice?.(message);
    return settings.all ? `${message}\n` : undefined;
  }
  if (top.exitCode !== 0)
    return settings.all ? "Lint check failed: not in a Git repository.\n" : undefined;
  const root = top.output.replace(/\n$/, "");
  const run: Io["run"] = (argv, options) => io.run(argv, { cwd: options?.cwd ?? root });
  const off = await run(["git", "config", "--type=bool", "--get", "agent-hook.lint-code.enabled"]);
  if (!settings.all && off?.output.trim() === "false") return;
  const git = async (...args: string[]) => {
    const ran = await run(["git", ...args]);
    if (ran?.exitCode === 0) return ran.output.split("\0").filter(Boolean);
    throw new Error(`Cannot select lint targets: git ${args[0]} failed`);
  };
  // shortcut: git includes edits from before this session. Track transcript
  // paths instead if checks must exclude pre-existing uncommitted work.
  const head = await run(["git", "rev-parse", "--verify", "HEAD"]);
  const changed = new Set(
    settings.all || head?.exitCode !== 0
      ? await git("ls-files", "-z", "--cached", "--others", "--exclude-standard")
      : [
          ...(await git("diff", "--name-only", "-z", "--diff-filter=d", "HEAD")),
          ...(await git("ls-files", "-z", "--others", "--exclude-standard")),
        ],
  );
  const tmpdir = settings.tmpdir?.replace(/^\/private/, "").replace(/\/$/, "");
  const files: string[] = [];
  for (const name of changed) {
    if (!/\.(?:py|jsx?|tsx?|mjs|cjs|mts|cts|sh|bash|ya?ml|tf)$/.test(name)) continue;
    const file = `${root}/${name}`;
    const plain = file.replace(/^\/private/, "");
    if (
      !settings.all &&
      (/^\/(var\/)?tmp\//.test(plain) || (tmpdir && plain.startsWith(`${tmpdir}/`)))
    )
      continue;
    if ((await io.stat(file))?.isFile) files.push(file);
  }
  const notices: string[] = [];
  const output = await lint(
    files,
    { ...io, run },
    {
      ...settings,
      root,
      notice: (message) => {
        notices.push(message);
        settings.notice?.(message);
      },
    },
  );
  if (output === undefined && (!settings.all || notices.length === 0)) return;
  const report = `${output ?? ""}${settings.all ? notices.join("\n") : ""}`;
  return `${settings.verify ? "Final lint verification" : "Lint errors"}:\n${report}\n${settings.verify || settings.all ? "" : "Fix the lint errors, rerun the relevant checks, then stop. Report any remaining failures.\n"}`;
}

/**
 * Ansible YAML, by directory or content. Generic basenames alone are not evidence. ansible-lint
 * only runs on these; other YAML goes to yamllint.
 */
async function isAnsible(file: string, io: Io): Promise<boolean> {
  return (
    /\/(roles|tasks|handlers|playbooks|group_vars|host_vars|molecule)\//.test(file) ||
    /^\s*(?:-\s+)?(?:hosts|tasks|roles|ansible\.builtin\.[\w]+):/m.test(await io.read(file))
  );
}

const YAMLLINT_NAMES = [".yamllint", ".yamllint.yaml", ".yamllint.yml"];

/** Nearest project config, bounded by the repository root. */
async function projectConfig(file: string, names: string[], io: Io, root?: string) {
  let dir = file.includes("/") ? file.slice(0, file.lastIndexOf("/")) || "/" : ".";
  while (true) {
    for (const name of names) {
      const config = `${dir === "/" ? "" : dir}/${name}`;
      if ((await io.stat(config))?.isFile) return { config, dir };
    }
    if (dir === root || dir === "/" || dir === "." || !dir.includes("/")) return;
    dir = dir.slice(0, dir.lastIndexOf("/")) || "/";
  }
}

/** Accept both deployed names and chezmoi source names. */
async function bundledConfig(name: string, io: Io, settings: Settings): Promise<string> {
  const deployed = `${settings.configDir}/${name}`;
  if ((await io.stat(deployed))?.isFile) return deployed;
  const source = `${settings.configDir}/dot_${name.slice(1)}`;
  return (await io.stat(source))?.isFile ? source : deployed;
}

/** Helm templates contain Go templates, not plain YAML. */
async function helmTemplate(file: string, io: Io): Promise<boolean> {
  const parts = file.split("/templates/");
  for (let i = 0; i < parts.length - 1; i++) {
    if ((await io.stat(`${parts.slice(0, i + 1).join("/templates/")}/Chart.yaml`))?.isFile)
      return true;
  }
  return false;
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
    case "yaml": {
      if (disabled("yaml") || (await helmTemplate(file, io))) return undefined;
      const ansible = await isAnsible(file, io);
      const own = await projectConfig(
        file,
        ansible
          ? [
              ".ansible-lint",
              ".ansible-lint.yml",
              ".ansible-lint.yaml",
              ".config/ansible-lint.yml",
              ".config/ansible-lint.yaml",
            ]
          : YAMLLINT_NAMES,
        io,
        settings.root,
      );
      const fallbackName = ansible ? ".ansible-lint" : ".yamllint";
      const fallback = await bundledConfig(fallbackName, io, settings);
      const cwd = own?.dir ?? settings.root;
      const target = cwd && file.startsWith(`${cwd}/`) ? file.slice(cwd.length + 1) : file;
      if (!ansible)
        return { argv: ["yamllint", "--strict", "-c", own?.config ?? fallback, target], cwd };
      // ansible-lint looks for a yamllint config itself, down to ~/.config/yamllint/config.
      // --yamllint-file comes first in that search, so no file outside the repository changes
      // the result.
      const yamllint =
        (await projectConfig(file, YAMLLINT_NAMES, io, settings.root))?.config ??
        (await bundledConfig(".yamllint", io, settings));
      return {
        argv: [
          "ansible-lint",
          "-c",
          own?.config ?? fallback,
          "--yamllint-file",
          yamllint,
          "-q",
          target,
        ],
        cwd,
      };
    }
    case "tf": {
      if (disabled("tf")) return undefined;
      // tflint lints a whole module, so it runs in the folder of the file,
      // and --filter keeps the issues of this file. With --chdir, --filter
      // matches nothing (tflint 0.64.0). A .tflint.hcl or .tflint.json of
      // the module wins over the bundled config.
      const slash = file.lastIndexOf("/");
      const dir = file.slice(0, slash) || "/";
      const own = (await io.stat(`${dir}/.tflint.hcl`)) ?? (await io.stat(`${dir}/.tflint.json`));
      const fallback = own ? undefined : await bundledConfig(".tflint.hcl", io, settings);
      return {
        argv: [
          "tflint",
          ...(own ? [] : [`--config=${fallback}`]),
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
  const notices = new Set<string>();
  const notice = (message: string) => {
    if (!notices.has(message)) settings.notice?.(message);
    notices.add(message);
  };
  for (const file of files) {
    const found = await linter(file, io, settings);
    if (!found) continue;
    const program = found.argv[0];
    const ran = await io.run(found.argv, { cwd: found.cwd });
    if (
      !ran ||
      ran.exitCode < 0 ||
      TFLINT_PLUGIN_MISSING.test(ran.output) ||
      MISE_SHIM_VERSION_MISSING.test(ran.output)
    ) {
      notice(
        `Lint coverage incomplete: ${program}: ${!ran ? "could not start (missing executable or invalid working directory)" : ran.output.trim()}`,
      );
      continue;
    }
    output += ran.output;
    if (ran.exitCode !== 0) failed = true;
  }
  return failed ? output : undefined;
}
