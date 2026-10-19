/**
 * The block-commit-attribution matcher: finds a `git commit` whose message
 * has a `Co-Authored-By: Claude` trailer. Pure: the adapters pass the command
 * line in.
 *
 * Adapters: hooks/register.ts (Claude Code mod), pi.ts (pi and omp).
 */

// The model writes Co-Authored-By and Co-authored-by.
const TRAILER = /co-authored-by:\s*claude/i;
// `commit` as a whole word, so `git log --grep 'Co-Authored-By: Claude'` and
// `rg ... committed.txt` pass.
const COMMIT = /(^|[^A-Za-z0-9_-])commit([^A-Za-z0-9_-]|$)/i;

/** The reason the model reads when the call is blocked. */
export const MESSAGE =
  "Blocked: remove the Co-Authored-By: Claude trailer from the commit message and run the commit again. The user does not want attribution lines in commits.";

/**
 * The block message when the line commits with a Claude trailer, else
 * undefined. shortcut: a message written to a file first and passed with
 * `git commit -F <file>` passes; a git commit-msg hook is the upgrade path.
 */
export function violation(line: string): string | undefined {
  return COMMIT.test(line) && TRAILER.test(line) ? MESSAGE : undefined;
}
