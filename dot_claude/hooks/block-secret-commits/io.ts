/**
 * The file and process functions of ./core.ts under Node, for command.ts and
 * pi.ts.
 */

import { spawn } from "node:child_process";
import { constants } from "node:fs";
import {
  access,
  copyFile,
  mkdtemp,
  readFile,
  rm,
  stat,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Io, Settings } from "./core.ts";

export function nodeIo(root: string): Io {
  const at = (path: string) => resolve(root, path);
  return {
    run: (argv, timeoutMs) =>
      new Promise((done) => {
        const [program = "", ...args] = argv;
        // The timeout option kills the child with SIGTERM, which the close
        // event reports as the signal.
        const child = spawn(program, args, {
          cwd: root,
          stdio: ["ignore", "pipe", "ignore"],
          timeout: timeoutMs,
        });
        let stdout = "";
        child.stdout.on("data", (chunk) => (stdout += chunk));
        // A program that cannot start, or a root that does not exist.
        child.on("error", () => done(undefined));
        child.on("close", (code, signal) =>
          done({
            exitCode: code ?? -1,
            stdout,
            timedOut: signal === "SIGTERM",
          }),
        );
      }),
    read: (path) => readFile(at(path), "utf8").catch(() => undefined),
    size: async (path) => {
      try {
        await access(at(path), constants.R_OK);
        return (await stat(at(path))).size;
      } catch {
        return undefined;
      }
    },
    tempDir: () =>
      mkdtemp(join(tmpdir(), "block-secret-commits-")).catch(() => undefined),
    copy: (from, to) =>
      copyFile(at(from), to).then(
        () => true,
        () => false,
      ),
    remove: (path) => rm(path, { recursive: true, force: true }),
  };
}

export function nodeSettings(root: string): Settings {
  return {
    root,
    allow: process.env.CLAUDE_ALLOW_SECRETS,
    // import.meta.url is the real path, also when pi loads pi.ts by setting.
    config: fileURLToPath(new URL("./conf/betterleaks.toml", import.meta.url)),
  };
}
