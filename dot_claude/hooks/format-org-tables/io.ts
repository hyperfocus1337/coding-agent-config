/**
 * The file and process functions of ./core.ts under Node, for command.ts and
 * pi.ts. The mod defines the same functions over `$` in hooks/register.ts.
 */

import { spawn } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import type { Io, Settings } from "./core.ts";

export function nodeIo(): Io {
  return {
    stat: (path) =>
      stat(path).then(
        (found) => ({
          kind: found.isFile() ? "file" : found.isDirectory() ? "dir" : "other",
          mtimeMs: found.mtimeMs,
        }),
        () => undefined,
      ),
    read: (path) => readFile(path, "utf8").catch(() => undefined),
    run: (argv, { cwd, env, timeoutMs = 30_000 }) =>
      new Promise((resolve) => {
        const [program = "", ...args] = argv;
        const child = spawn(program, args, {
          cwd,
          env: { ...process.env, ...env },
          stdio: ["ignore", "pipe", "ignore"],
          timeout: timeoutMs,
        });
        let stdout = "";
        child.stdout.on("data", (chunk) => (stdout += chunk));
        // A program that cannot start (not installed, or a cwd that does not
        // exist) counts as missing.
        child.on("error", () => resolve(undefined));
        child.on("close", (code) => resolve({ exitCode: code ?? 1, stdout }));
      }),
  };
}

export function nodeSettings(): Settings {
  return { tmpdir: process.env.TMPDIR };
}
