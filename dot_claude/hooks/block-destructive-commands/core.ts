/**
 * The verdict of dcg (destructive_command_guard) on one shell command. In
 * robot mode the exit code carries the decision: 0 allows, 1 denies with a JSON
 * reason on stdout, and 3 or more is a dcg error.
 */

export interface Io {
  /** Runs dcg on the command. `undefined` when dcg cannot start. */
  dcg(command: string): Promise<{ exitCode: number; stdout: string } | undefined>;
}

export const FALLBACK = "Blocked by dcg (destructive command).";

/** Returns the block reason, or `undefined` to allow. */
export async function check(command: string, io: Io): Promise<string | undefined> {
  if (!command.trim()) return undefined;
  const run = await io.dcg(command);
  // Fail open: a missing dcg, a dcg error, or a timeout lets the call run.
  if (run?.exitCode !== 1) return undefined;
  try {
    const { reason, rule_id } = JSON.parse(run.stdout) as {
      reason?: unknown;
      rule_id?: unknown;
    };
    if (typeof reason !== "string" || !reason) return FALLBACK;
    return typeof rule_id === "string" ? `${reason} [${rule_id}]` : reason;
  } catch {
    return FALLBACK;
  }
}
