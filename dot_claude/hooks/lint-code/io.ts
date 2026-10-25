/**
 * The file and process functions of ./core.ts under Node, for command.ts and
 * pi.ts. The mod defines the same functions over `$` in hooks/register.ts.
 */

import { spawn } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import type { Io, Settings } from "./core.ts";

export function nodeIo(cwd: string): Io {
  return {
    stat: (path) =>
      stat(path).then(
        (found) => ({ isFile: found.isFile(), mtimeMs: found.mtimeMs }),
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
        child.stdout.on("data", (chunk) => (stdout += chunk));
        child.stderr.on("data", (chunk) => (stderr += chunk));
        // A program that cannot start (not installed) skips its file.
        child.on("error", () => resolve(undefined));
        child.on("close", (code) => resolve({ exitCode: code ?? 1, output: stdout + stderr }));
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
