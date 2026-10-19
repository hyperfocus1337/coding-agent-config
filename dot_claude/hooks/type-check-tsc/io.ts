/**
 * The file and process functions of ./core.ts under Node, for command.ts and
 * pi.ts.
 */

import { spawn } from "node:child_process";
import { stat } from "node:fs/promises";
import type { Io } from "./core.ts";

/** How long one program may run: a type checker can take long. */
const TIMEOUT_MS = 60_000;

export function nodeIo(): Io {
  return {
    isFile: (path) =>
      stat(path).then(
        (found) => found.isFile(),
        () => false,
      ),
    run: (argv, cwd) =>
      new Promise((resolve) => {
        const [program = "", ...args] = argv;
        const child = spawn(program, args, {
          cwd,
          stdio: ["ignore", "pipe", "pipe"],
          timeout: TIMEOUT_MS,
        });
        let stdout = "";
        let stderr = "";
        child.stdout.on("data", (chunk) => (stdout += chunk));
        child.stderr.on("data", (chunk) => (stderr += chunk));
        // A program that cannot start (not installed) counts as missing, and
        // so does one that the timeout stops: its output is cut off.
        child.on("error", () => resolve(undefined));
        child.on("close", (code, signal) =>
          resolve(signal ? undefined : { exitCode: code ?? 1, stdout, stderr }),
        );
      }),
  };
}
