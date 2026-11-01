/**
 * The verdict of dcg (destructive_command_guard) on one shell command.
 * Hook mode returns its permission decision and approval details as JSON on
 * stdout with exit 0. Exit 1 is also treated as a denial.
 */

import { createHash } from "node:crypto";
import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

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

/** Added to the first confirmable denial, so that the agent looks for another way first. */
export const RETRY_HINT =
  "First look for a safer command that reaches the same goal, and use it. Only if no such command exists, tell the user why you need this command, then run it again unchanged in the same directory. The user then gets a prompt to approve it once.";

const sha = (text: string) => createHash("sha256").update(text).digest("hex");

/**
 * Records a confirmable denial. Returns true when the session already got a
 * denial for the same command in the same directory: the agent found no other
 * way, so the user gets the prompt. A state that cannot be read or written
 * returns false, which keeps the denial.
 */
export function retried(
  session: string,
  cwd: string,
  command: string,
  dir = join(tmpdir(), "block-destructive-commands"),
): boolean {
  const file = join(dir, sha(session));
  const key = sha(`${cwd}\0${command}`);
  try {
    if (readFileSync(file, "utf8").split("\n").includes(key)) return true;
  } catch {
    // No denial in this session yet.
  }
  try {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    appendFileSync(file, `${key}\n`, { mode: 0o600 });
  } catch {
    // Without a record, the next retry is denied again and the code still works.
  }
  return false;
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
