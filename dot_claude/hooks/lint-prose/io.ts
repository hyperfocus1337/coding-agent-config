/**
 * The file and process functions of ./core.ts under Node, for command.ts and
 * pi.ts. The mod defines the same functions over `$` in hooks/register.ts.
 */

import { spawn } from "node:child_process";
import { readFile, stat, writeFile } from "node:fs/promises";
import type { Io, Settings } from "./core.ts";

export function nodeIo(): Io {
  return {
    isFile: (path) =>
      stat(path).then(
        (found) => found.isFile(),
        () => false,
      ),
    read: (path) => readFile(path, "utf8").catch(() => undefined),
    write: (path, text) => writeFile(path, text),
    run: (argv, cwd) =>
      new Promise((resolve) => {
        const [program = "", ...args] = argv;
        const child = spawn(program, args, {
          cwd,
          stdio: ["ignore", "pipe", "pipe"],
        });
        let stdout = "";
        let stderr = "";
        child.stdout.on("data", (chunk) => (stdout += chunk));
        child.stderr.on("data", (chunk) => (stderr += chunk));
        // A program that cannot start (not installed) counts as missing.
        child.on("error", () => resolve(undefined));
        child.on("close", (code) =>
          resolve({ exitCode: code ?? 1, stdout, stderr }),
        );
      }),
  };
}

export function nodeSettings(): Settings {
  const env = process.env;
  return {
    disable: env.CLAUDE_LINT_DISABLE,
    tmpdir: env.TMPDIR,
    valeDir: env.LINT_PROSE_VALE_DIR || `${env.HOME}/.config/vale`,
    hooksOff: env.AGENT_HOOKS_DISABLE,
  };
}
