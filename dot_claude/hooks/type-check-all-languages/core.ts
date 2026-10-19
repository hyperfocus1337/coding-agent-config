/**
 * The type-check-all-languages logic: type-checks the whole project once, when
 * the agent stops, with a checker for each language that git reports as
 * changed. Follows the pyrefly agentic-loop advice
 * (pyrefly.org/blog/pyrefly-agentic-loop): run the checker at the project
 * root and hand the errors to the model. The adapters pass in the process
 * functions, and each adapter keeps its own loop guard.
 *
 * Adapters: pi.ts (pi and omp), command.ts (Claude Code and Codex). Why a
 * stop and not each edit: README.md.
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

/**
 * A checker starts when a changed path matches `changed`, and only when the
 * root holds `needs`: tsc with no tsconfig.json prints its whole help text
 * and exits 1.
 */
const CHECKERS = [
  { changed: /\.py$/, argv: ["pyrefly", "check"] },
  {
    changed: /\.(ts|tsx|mts|cts)$/,
    argv: ["tsc", "--noEmit"],
    needs: "tsconfig.json",
  },
];

/** Type-checks the repository that holds `cwd`; the errors, or undefined. */
export async function check(cwd: string, io: Io): Promise<string | undefined> {
  // Outside a work tree there is nothing to compare, so skip. Run from the
  // root, so the checkers see the same scope as the changed-path list.
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

  // Every checker runs, so one stop reports every language. A missing
  // checker is a skip. pyrefly exits 1 when its config matches no files,
  // which is nothing to check, not a type error.
  let errors = "";
  for (const { changed: pattern, argv, needs } of CHECKERS) {
    if (!changed.some((path) => pattern.test(path))) continue;
    if (needs && !(await io.isFile(`${root}/${needs}`))) continue;
    const ran = await io.run(argv, root);
    if (!ran || ran.exitCode === 0) continue;
    const output = (ran.stdout + ran.stderr).replace(/\n+$/, "");
    if (output.includes("No Python files matched")) continue;
    errors += `${output}\n`;
  }
  return errors
    ? `${errors}Type check failed. Fix the errors above, then stop.\n`
    : undefined;
}
