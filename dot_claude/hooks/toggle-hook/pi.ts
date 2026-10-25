/**
 * pi and omp extension: adds `/toggle-hook`, which sets AGENT_HOOKS_DISABLE
 * in the agent process, or with `--repo` or `--global` writes git config. The extensions of the other hooks read both on their next
 * run. The status line names the hooks that are off. Loaded through the
 * `extensions` setting of each agent.
 *
 * No io.ts: the variable is the state, so this file reads and writes
 * process.env itself, and runs git itself. In omp, a Bash call does not get
 * the change (omp 18.12.2), but no hook reads it there.
 */

import { spawnSync } from "node:child_process";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  command,
  globalFile,
  HOOKS,
  NAMES,
  readConfig,
  status,
  type Git,
} from "./core.ts";

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
  // A value set at launch and the git config state show from the start.
  pi.on("session_start", async (_event, ctx) => {
    ctx.ui.setStatus(
      "toggle-hook",
      status(process.env.AGENT_HOOKS_DISABLE, await readConfig(gitIn(ctx.cwd))),
    );
  });
  pi.registerCommand("toggle-hook", {
    description:
      "Turn an advisory hook off or on, until you quit, or with --repo or --global in git config",
    // pi puts the value in place of the whole argument text.
    getArgumentCompletions: (prefix) => {
      const text = prefix.trim();
      const flag = ["--repo", "--global"].find((flag) => text.startsWith(flag));
      const choices = flag
        ? [...NAMES, "all"].map((name) => `${flag} ${name}`)
        : ["--repo", "--global", ...HOOKS, "all"];
      return choices
        .filter((choice) => choice.startsWith(text))
        .map((choice) => ({ value: choice, label: choice }));
    },
    handler: async (args, ctx) => {
      const { value, text, config } = await command(
        process.env.AGENT_HOOKS_DISABLE,
        args,
        gitIn(ctx.cwd),
        globalFile(process.env),
      );
      if (value === undefined) delete process.env.AGENT_HOOKS_DISABLE;
      else process.env.AGENT_HOOKS_DISABLE = value;
      ctx.ui.setStatus("toggle-hook", status(value, config));
      ctx.ui.notify(text, "info");
    },
  });
}
