import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

/** Claude resource locations for this session, not for the agent settings directory. */
export function projectRoot(cwd: string): string | undefined {
  const root = path.join(cwd, ".claude");
  if (root === path.join(os.homedir(), ".claude")) return undefined;
  return ["commands", "rules", "skills"].some((kind) => fs.existsSync(path.join(root, kind)))
    ? root
    : undefined;
}

/** Require approval before local instructions or shell-capable commands load. */
export async function approvedProjectRoot(ctx: ExtensionContext): Promise<string | undefined> {
  const root = projectRoot(ctx.cwd);
  if (!root) return undefined;
  const argv = process.argv.slice(2);
  if (argv.includes("--no-approve")) return undefined;
  if (argv.includes("--approve")) return root;
  const { ProjectTrustStore, SettingsManager, getAgentDir } =
    await import("@earendil-works/pi-coding-agent");
  const agentDir = getAgentDir();
  const saved = new ProjectTrustStore(agentDir).get(ctx.cwd);
  if (saved !== null) return saved ? root : undefined;
  const fallback = SettingsManager.create(ctx.cwd, agentDir).getDefaultProjectTrust();
  if (fallback !== "ask") return fallback === "always" ? root : undefined;
  if (ctx.mode !== "tui") return undefined;
  const trusted = await ctx.ui.confirm(
    "Trust local Claude resources?",
    `Load commands, rules, and skills from ${root}? Commands can execute shell code. Use /trust to save a decision.`,
  );
  return trusted ? root : undefined;
}

/** Resolve approval once and notify each resource extension through pi's event bus. */
export default function claudeProject(pi: ExtensionAPI): void {
  pi.on("session_start", async (_event, ctx) => {
    pi.events.emit("claude-project", await approvedProjectRoot(ctx));
  });
}
