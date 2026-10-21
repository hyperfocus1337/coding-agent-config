/**
 * The type-check-tsc logic: runs `tsc --noEmit` on the whole project once,
 * when the agent stops, if git reports a changed TypeScript file. The
 * adapters pass in the process functions, and each adapter keeps its own
 * loop guard. type-check-pyrefly is the same hook for Python.
 *
 * Adapters: pi.ts (pi), omp.ts (omp), command.ts (Claude Code and Codex).
 * Why a stop and not each edit: README.md.
 */

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
  /** AGENT_HOOKS_DISABLE: the hooks /toggle-hook turned off. */
  hooksOff?: string;
}

/** Type-checks the repository that holds `cwd`; the errors, or undefined. */
export async function check(
  cwd: string,
  io: Io,
  settings: Settings,
): Promise<string | undefined> {
  if ((settings.hooksOff ?? "").split(/[\s,]+/).includes("type-check-tsc"))
    return undefined;
  // Outside a work tree there is nothing to compare, so skip. Run from the
  // root, so tsc sees the same scope as the changed-path list.
  const top = await io.run(["git", "rev-parse", "--show-toplevel"], cwd);
  if (top?.exitCode !== 0) return undefined;
  const root = top.stdout.replace(/\n$/, "");
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
  ];
  if (!changed.some((path) => /\.(ts|tsx|mts|cts)$/.test(path)))
    return undefined;

  // tsc with no tsconfig.json prints its whole help text and exits 1. A
  // missing tsc is a skip.
  if (!(await io.isFile(`${root}/tsconfig.json`))) return undefined;
  const ran = await io.run(["tsc", "--noEmit"], root);
  if (!ran || ran.exitCode === 0) return undefined;
  const output = (ran.stdout + ran.stderr).replace(/\n+$/, "");
  return `${output}\nType check failed. Fix the errors above, then stop.\n`;
}
