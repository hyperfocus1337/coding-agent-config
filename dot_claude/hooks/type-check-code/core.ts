/**
 * The type-check-code logic: when the agent stops, runs each checker of CHECKERS on the whole
 * project once, if git reports a changed file of that checker. tsc and pyrefly run in parallel, one
 * module each in checkers/. The adapters pass in the file and process functions, and each adapter
 * keeps its own loop guard.
 *
 * Adapters: pi.ts (pi), omp.ts (omp), command.ts (Claude Code and Codex).
 * Why a stop and not each edit: README.md.
 */

import { pyrefly } from "./checkers/pyrefly.ts";
import { tsc } from "./checkers/tsc.ts";

export interface Io {
  /** Whether a path is a regular file. */
  isFile(path: string): Promise<boolean>;
  /**
   * The exit code, stdout, and stderr; undefined when the program cannot
   * start or runs past its time.
   */
  run(
    argv: string[],
    cwd: string,
  ): Promise<{ exitCode: number; stdout: string; stderr: string } | undefined>;
}

export interface Settings {
  /**
   * AGENT_HOOKS_DISABLE: the hooks /toggle-hook turned off, and the checkers as
   * type-check-code.<key>.
   */
  hooksOff?: string;
}

/** A type checker: the files that start it, and its command at the repository root. */
export interface Checker {
  /**
   * The key that turns it off: agent-hook.type-check-code.<key> in git config, or
   * type-check-code.<key> in AGENT_HOOKS_DISABLE.
   */
  key: string;
  /** The file extensions without the dot. A changed file with one of them starts the checker. */
  extensions: string[];
  /** The command to run at `root`; undefined skips the checker. */
  command(root: string, io: Io): Promise<string[] | undefined>;
  /** Output of a failed run that is not a type error, so it does not block. */
  noErrors?: RegExp;
  /** The line after the errors, which tells the model what to do. */
  advice: string;
}

export const CHECKERS: Checker[] = [tsc, pyrefly];

/** The name of this hook in AGENT_HOOKS_DISABLE and in git config. */
const HOOK = "type-check-code";

/** Type-checks the repository that holds `cwd`; the errors, or undefined. */
export async function check(cwd: string, io: Io, settings: Settings): Promise<string | undefined> {
  const sessionOff = new Set((settings.hooksOff ?? "").split(/[\s,]+/));
  if (sessionOff.has(HOOK)) return undefined;
  // Outside a work tree there is nothing to compare, so skip. Run from the root, so each checker
  // sees the same scope as the changed-path list.
  const top = await io.run(["git", "rev-parse", "--show-toplevel"], cwd);
  if (top?.exitCode !== 0) return undefined;
  const root = top.stdout.replace(/\n$/, "");
  // /toggle-hook --repo turns the hook or one checker off in the git config of the repository. A
  // value that is not a boolean keeps it on.
  const repoOff = async (key: string) =>
    (
      await io.run(["git", "config", "--type=bool", "--get", `agent-hook.${HOOK}.${key}`], root)
    )?.stdout.trim() === "false";
  if (await repoOff("enabled")) return undefined;
  // Tracked edits against HEAD plus untracked files, without deleted files.
  // A diff with no HEAD (the first commit) fails and adds nothing.
  // shortcut: a git diff also covers work from before the session. The
  // upgrade is the edited paths from the transcript.
  const git = async (...args: string[]) => {
    const ran = await io.run(["git", ...args], root);
    return ran?.exitCode === 0 ? ran.stdout.split("\0") : [];
  };
  const changed = [
    ...(await git("diff", "--name-only", "-z", "--diff-filter=d", "HEAD")),
    ...(await git("ls-files", "-z", "--others", "--exclude-standard")),
  ].map((path) => /\.([^./]+)$/.exec(path)?.[1]);

  // In parallel, so the hook takes as long as the slowest checker, not their sum. A missing
  // checker is a skip.
  const found = await Promise.all(
    CHECKERS.map(async (checker) => {
      if (sessionOff.has(`${HOOK}.${checker.key}`)) return "";
      if (!changed.some((extension) => extension && checker.extensions.includes(extension)))
        return "";
      if (await repoOff(checker.key)) return "";
      const argv = await checker.command(root, io);
      const ran = argv && (await io.run(argv, root));
      if (!ran || ran.exitCode === 0) return "";
      const output = (ran.stdout + ran.stderr).replace(/\n+$/, "");
      if (checker.noErrors?.test(output)) return "";
      return `${output}\n${checker.advice}\n`;
    }),
  );
  return found.join("") || undefined;
}
