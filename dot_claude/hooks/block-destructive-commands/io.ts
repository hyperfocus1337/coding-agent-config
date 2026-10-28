/**
 * The process function of ./core.ts under Node, for pi.ts.
 */

import { spawn, spawnSync } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";
import type { Io } from "./core.ts";

// mise links dcg here, see README.md#install. A fixed path, not PATH, so the guard
// also runs when the PATH of the agent does not have ~/.local/bin.
export const DCG = join(homedir(), ".local", "bin", "dcg");

export function nodeIo(cwd: string, bin = DCG): Io {
  return {
    dcg: (command) => {
      if (
        (process.env.AGENT_HOOKS_DISABLE ?? "")
          .split(/[\s,]+/)
          .includes("block-destructive-commands")
      )
        return Promise.resolve(undefined);
      try {
        const config = spawnSync(
          "git",
          ["config", "--type=bool", "--get", "agent-hook.block-destructive-commands.enabled"],
          { cwd, encoding: "utf8", timeout: 1000 },
        );
        if (config.status === 0 && config.stdout.trim() === "false")
          return Promise.resolve(undefined);
      } catch {
        // An unavailable git config does not turn the guard off.
      }
      return new Promise((done) => {
        let child;
        // Bun, which runs pi and omp, throws a failed spawn here instead of
        // emitting an error event, and can give a child with no stdout.
        try {
          child = spawn(bin, ["hook"], {
            cwd,
            env: { ...process.env, DCG_NO_SELF_HEAL: "1" },
            stdio: ["pipe", "pipe", "ignore"],
            timeout: 5000,
          });
        } catch {
          return done(undefined);
        }
        child.stdin?.on("error", () => done(undefined));
        child.stdin?.end(
          JSON.stringify({ tool_name: "Bash", tool_input: { command }, cwd }) + "\n",
        );
        let stdout = "";
        child.stdout?.on("data", (chunk) => (stdout += chunk));
        // A dcg that is not installed, or a cwd that does not exist.
        child.on("error", () => done(undefined));
        // The timeout kills dcg with a signal, so the code is null.
        child.on("close", (code) => done({ exitCode: code ?? -1, stdout }));
      });
    },
  };
}
