/**
 * Git pre-commit hook, not an agent hook: blocks a commit that would add a
 * secret. Exits 1 with the block message on stderr. A warning, such as a
 * capped scan, goes to stderr with exit 0. ~/.config/git/config sets this
 * hook for every commit, yours and an agent's. Design notes: README.md.
 *
 * Run: node main.ts, from git as a pre-commit hook.
 */

import { spawn } from "node:child_process";
import { constants } from "node:fs";
import { access, mkdtemp, open, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { check, type Io, type Settings } from "./core.ts";

// Git runs the hook at the root of the worktree.
const root = process.cwd();
const verdict = await check(nodeIo(root), nodeSettings(root));
for (const warning of verdict.warnings) process.stderr.write(`${warning}\n`);
if (verdict.block) {
  process.stderr.write(`${verdict.block}\n`);
  process.exitCode = 1;
}

function nodeIo(root: string): Io {
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
    tempDir: () => mkdtemp(join(tmpdir(), "block-secret-commits-")).catch(() => undefined),
    exportBlob: async (path, to) => {
      const file = await open(to, "wx");
      try {
        return await new Promise<boolean>((done) => {
          const child = spawn("git", ["cat-file", "blob", `:${path}`], {
            cwd: root,
            stdio: ["ignore", file.fd, "ignore"],
          });
          child.on("error", () => done(false));
          child.on("close", (code) => done(code === 0));
        });
      } finally {
        await file.close();
      }
    },
    remove: (path) => rm(path, { recursive: true, force: true }),
  };
}

function nodeSettings(root: string): Settings {
  return {
    root,
    allow: process.env.AGENT_ALLOW_SECRETS,
    config: fileURLToPath(new URL("./conf/betterleaks.toml", import.meta.url)),
  };
}
