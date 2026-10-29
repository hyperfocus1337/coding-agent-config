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

/** Returns the block reason, or `undefined` to allow. */
export async function check(command: string, io: Io): Promise<string | undefined> {
  if (!command.trim()) return undefined;
  const run = await io.dcg(command);
  if (!run || (run.exitCode !== 0 && run.exitCode !== 1)) return FAILURE;
  const fallback = run.exitCode === 1 ? FALLBACK : undefined;
  if (!run.stdout.trim()) return fallback;
  try {
    const parsed = JSON.parse(run.stdout);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return FAILURE;
    const output = parsed.hookSpecificOutput;
    if (output !== undefined && !["allow", "deny"].includes(output?.permissionDecision))
      return FAILURE;
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
    return reason;
  } catch {
    return fallback ?? FAILURE;
  }
}
