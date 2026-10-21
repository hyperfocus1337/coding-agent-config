/**
 * The process function of ./core.ts under Node, for the 3 adapters.
 */

import { spawn } from "node:child_process";
import type { Io, Settings } from "./core.ts";

/** How long one program may run: a type checker can take long. */
const TIMEOUT_MS = 60_000;

export function nodeIo(): Io {
  return {
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
        // Decode as a stream, so that a character split across two chunks
        // stays whole.
        child.stdout.setEncoding("utf8");
        child.stderr.setEncoding("utf8");
        child.stdout.on("data", (chunk: string) => (stdout += chunk));
        child.stderr.on("data", (chunk: string) => (stderr += chunk));
        // A program that cannot start (not installed) counts as missing, and
        // so does one that the timeout stops: its output is cut off.
        child.on("error", () => resolve(undefined));
        child.on("close", (code, signal) =>
          resolve(signal ? undefined : { exitCode: code ?? 1, stdout, stderr }),
        );
      }),
  };
}

export function nodeSettings(): Settings {
  return { hooksOff: process.env.AGENT_HOOKS_DISABLE };
}
