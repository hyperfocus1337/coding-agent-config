/**
 * The file and process functions of ./core.ts under Node, for pi.ts and
 * command.ts. The mod defines the same functions over `$` in hooks/register.ts.
 */

import { spawn } from "node:child_process";
import {
  appendFile,
  copyFile,
  link,
  mkdir,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  stat,
  utimes,
  writeFile,
} from "node:fs/promises";
import { dirname } from "node:path";
import type { Io } from "./core.ts";

/** The patch output of a call with many changed files can be large. */
const MAX_OUTPUT = 64 * 1024 * 1024;

const ok = (done: Promise<unknown>) =>
  done.then(
    () => true,
    () => false,
  );

export function nodeIo(): Io {
  return {
    read: (path) => readFile(path, "utf8").catch(() => undefined),
    write: async (path, text) => {
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, text);
    },
    append: async (path, text) => {
      await mkdir(dirname(path), { recursive: true });
      await appendFile(path, text);
    },
    exists: (path) => ok(stat(path)),
    mtime: (path) =>
      stat(path).then(
        (found) => found.mtimeMs,
        () => undefined,
      ),
    list: (dir) => readdir(dir).catch(() => []),
    realpath: (path) => realpath(path).catch(() => undefined),
    mkdir: async (path) => {
      await mkdir(path, { recursive: true }).catch(() => undefined);
    },
    copy: (from, to) =>
      ok(
        copyFile(from, to)
          .then(() => stat(from))
          .then(({ atime, mtime }) => utimes(to, atime, mtime)),
      ),
    link: (from, to) => ok(link(from, to)),
    rename: (from, to) => ok(rename(from, to)),
    remove: (path) => rm(path, { recursive: true, force: true }),
    run: (argv, options = {}) =>
      new Promise((resolve) => {
        const [program = "", ...args] = argv;
        const child = spawn(program, args, {
          env: { ...process.env, ...options.env },
          stdio: ["pipe", "pipe", "ignore"],
        });
        let stdout = "";
        let truncated = false;
        child.stdout.setEncoding("utf8");
        child.stdout.on("data", (chunk: string) => {
          // After one dropped chunk, drop the rest too: the output stays a
          // prefix, with no gap in it.
          if (!truncated && stdout.length + chunk.length <= MAX_OUTPUT) stdout += chunk;
          else truncated = true;
        });
        // A child that exits before it reads its input closes the pipe.
        child.stdin.on("error", () => undefined);
        child.stdin.end(options.stdin ?? "");
        child.on("error", () => resolve(undefined));
        child.on("close", (code) => resolve({ exitCode: code ?? 1, stdout, truncated }));
      }),
  };
}
