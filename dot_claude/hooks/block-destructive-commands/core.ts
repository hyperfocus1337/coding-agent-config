/**
 * The verdict of dcg (destructive_command_guard) on one shell command.
 * Hook mode returns its permission decision and approval details as JSON on
 * stdout with exit 0. Exit 1 is also treated as a denial.
 */

export interface Io {
  /** Runs dcg on the command. `undefined` when dcg cannot start. */
  dcg(command: string): Promise<{ exitCode: number; stdout: string } | undefined>;
}

export const FALLBACK = "Blocked by dcg (destructive command).";
export const FAILURE =
  "Blocked: dcg could not check the command. Check its installation and output.";

/** A denial. `confirmable` is true when the user may approve it in the agent UI. */
export interface Verdict {
  reason: string;
  confirmable: boolean;
}

/**
 * True for a dcg denial that the user may approve with one keypress in the
 * agent UI. A denial from the guardrails pack keeps the `dcg allow-once` flow,
 * because that pack protects dcg itself. A denial with no pack ID is not
 * confirmable.
 */
export function confirmable(output: { packId?: unknown } | undefined): boolean {
  return typeof output?.packId === "string" && !/(^|\.)guardrails$/.test(output.packId);
}

/** Returns the block reason, or `undefined` to allow. */
export async function check(command: string, io: Io): Promise<string | undefined> {
  return (await verdict(command, io))?.reason;
}

/** Returns the denial, or `undefined` to allow. */
export async function verdict(command: string, io: Io): Promise<Verdict | undefined> {
  const failure = { reason: FAILURE, confirmable: false };
  if (!command.trim()) return undefined;
  const run = await io.dcg(command);
  if (!run || (run.exitCode !== 0 && run.exitCode !== 1)) return failure;
  const fallback = run.exitCode === 1 ? { reason: FALLBACK, confirmable: false } : undefined;
  if (!run.stdout.trim()) return fallback;
  try {
    const parsed = JSON.parse(run.stdout);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return failure;
    const output = parsed.hookSpecificOutput;
    if (output !== undefined && !["allow", "deny"].includes(output?.permissionDecision))
      return failure;
    if (output?.permissionDecision !== "deny") return fallback;
    let reason =
      typeof output.permissionDecisionReason === "string" && output.permissionDecisionReason
        ? output.permissionDecisionReason
        : FALLBACK;
    if (typeof output.ruleId === "string" && !reason.includes(output.ruleId)) {
      reason += `\nRule: ${output.ruleId}`;
    }
    if (typeof output.allowOnceCode === "string" && /^\d{6}$/.test(output.allowOnceCode)) {
      const approval = `dcg allow-once ${output.allowOnceCode}`;
      if (!reason.includes(approval)) reason += `\nUser approval: ${approval}`;
    }
    return { reason, confirmable: confirmable(output) };
  } catch {
    return fallback ?? failure;
  }
}
