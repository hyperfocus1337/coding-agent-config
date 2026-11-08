/** File and process functions for the stop-time adapters. */

import { spawn } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import type { Io, Settings } from "./core.ts";

export function nodeIo(cwd: string): Io {
  return {
    stat: (path) =>
      stat(path).then(
        (found) => ({ isFile: found.isFile() }),
        () => undefined,
      ),
    read: (path) => readFile(path, "utf8"),
    run: (argv, options) =>
      new Promise((resolve) => {
        const [program = "", ...args] = argv;
        const child = spawn(program, args, {
          cwd: options?.cwd ?? cwd,
          stdio: ["ignore", "pipe", "pipe"],
        });
        let stdout = "";
        let stderr = "";
        let timedOut = false;
        const timer = setTimeout(() => {
          timedOut = true;
          child.kill("SIGKILL");
        }, 30_000);
        child.stdout.setEncoding("utf8").on("data", (chunk) => (stdout += chunk));
        child.stderr.setEncoding("utf8").on("data", (chunk) => (stderr += chunk));
        child.on("error", () => {
          clearTimeout(timer);
          resolve(undefined);
        });
        child.on("close", (code) => {
          clearTimeout(timer);
          resolve(
            timedOut
              ? { exitCode: -1, output: "timed out after 30 seconds" }
              : {
                  exitCode: code ?? -1,
                  output: stdout + stderr || (code === null ? "process terminated by signal" : ""),
                },
          );
        });
      }),
  };
}

export function nodeSettings(): Settings {
  return {
    // import.meta.url is the real path, also when pi loads pi.ts by setting.
    configDir: fileURLToPath(new URL("./config", import.meta.url)),
    disable: process.env.CLAUDE_LINT_DISABLE,
    tmpdir: process.env.TMPDIR,
    hooksOff: process.env.AGENT_HOOKS_DISABLE,
  };
}
