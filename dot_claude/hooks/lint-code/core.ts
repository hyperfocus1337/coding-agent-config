/**
 * Lints changed and untracked source files once at the stop boundary. Each linter is a module in
 * linters/; this file selects the files, runs the linters, and collects the output.
 */

import { oxlint } from "./linters/oxlint.ts";
import { ruff } from "./linters/ruff.ts";
import { shellcheck } from "./linters/shellcheck.ts";
import { tflint } from "./linters/tflint.ts";
import { yaml } from "./linters/yaml.ts";

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

/** A linter: the files it takes and its command for one file. */
export interface Linter {
  /** The CLAUDE_LINT_DISABLE key. */
  key: string;
  /** File extensions without the dot. */
  extensions: string[];
  /** The command and the folder to run it in, else the repository root; undefined skips. */
  command(
    file: string,
    io: Io,
    settings: Settings,
  ): Promise<{ argv: string[]; cwd?: string } | undefined>;
  /** Output that tells the linter could not check the file, not a lint finding. */
  unavailable?: RegExp;
}

const LINTERS: Linter[] = [ruff, oxlint, shellcheck, yaml, tflint];

const linterOf = (file: string) => {
  const extension = /\.([^./]+)$/.exec(file)?.[1];
  return LINTERS.find(({ extensions }) => extension && extensions.includes(extension));
};

/**
 * check for the agent adapters: the lint errors, and the coverage notices with an exception as
 * one more notice. Each adapter then decides what its agent shows and whether it continues.
 */
export async function report(
  cwd: string,
  io: Io,
  settings: Settings,
): Promise<{ errors?: string; notices: string[] }> {
  const notices: string[] = [];
  try {
    const errors = await check(cwd, io, { ...settings, notice: (m) => notices.push(m) });
    return { errors, notices };
  } catch (error) {
    notices.push(`Lint coverage incomplete: ${String(error)}`);
    return { notices };
  }
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
    if (!linterOf(name)) continue;
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
  const off = (settings.disable ?? "").split(/[ ,]+/);
  let failed = false;
  let output = "";
  const notices = new Set<string>();
  const notice = (message: string) => {
    if (!notices.has(message)) settings.notice?.(message);
    notices.add(message);
  };
  for (const file of files) {
    const linter = linterOf(file);
    if (!linter || off.includes("all") || off.includes(linter.key)) continue;
    const found = await linter.command(file, io, settings);
    if (!found) continue;
    const program = found.argv[0];
    const ran = await io.run(found.argv, { cwd: found.cwd });
    if (
      !ran ||
      ran.exitCode < 0 ||
      linter.unavailable?.test(ran.output) ||
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
