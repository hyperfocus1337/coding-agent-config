/**
 * pi and omp extension: adds `/toggle-hook`, which sets AGENT_HOOKS_DISABLE
 * in the agent process, or with `--repo` writes git config in the session
 * repository. The extensions of the other hooks read both on their next
 * run. The status line names the hooks that are off. Loaded through the
 * `extensions` setting of each agent.
 *
 * No io.ts: the variable is the state, so this file reads and writes
 * process.env itself, and runs git itself. In omp, a Bash call does not get
 * the change (omp 18.12.2), but no hook reads it there.
 */

import { spawnSync } from "node:child_process";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { command, HOOKS, NAMES, repoOff, status, type Git } from "./core.ts";

/** git in `cwd`; undefined when git cannot start. */
const gitIn =
  (cwd: string): Git =>
  async (args) => {
    const ran = spawnSync("git", args, { cwd, encoding: "utf8" });
    return ran.error
      ? undefined
      : { exitCode: ran.status ?? 1, stdout: ran.stdout };
  };

export default function (pi: ExtensionAPI) {
  // A value set at launch and the repository state show from the start.
  pi.on("session_start", async (_event, ctx) => {
    ctx.ui.setStatus(
      "toggle-hook",
      status(process.env.AGENT_HOOKS_DISABLE, await repoOff(gitIn(ctx.cwd))),
    );
  });
  pi.registerCommand("toggle-hook", {
    description:
      "Turn an advisory hook off or on, until you quit or with --repo in this repository",
    // pi puts the value in place of the whole argument text.
    getArgumentCompletions: (prefix) => {
      const text = prefix.trim();
      const repo = text.startsWith("--repo");
      const choices = repo
        ? [...NAMES, "all"].map((name) => `--repo ${name}`)
        : ["--repo", ...HOOKS, "all"];
      return choices
        .filter((choice) => choice.startsWith(text))
        .map((choice) => ({ value: choice, label: choice }));
    },
    handler: async (args, ctx) => {
      const { value, text, repo } = await command(
        process.env.AGENT_HOOKS_DISABLE,
        args,
        gitIn(ctx.cwd),
      );
      if (value === undefined) delete process.env.AGENT_HOOKS_DISABLE;
      else process.env.AGENT_HOOKS_DISABLE = value;
      ctx.ui.setStatus("toggle-hook", status(value, repo));
      ctx.ui.notify(text, "info");
    },
  });
}
