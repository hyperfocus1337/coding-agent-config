/**
 * The process function of ./core.ts under Node, for pi.ts.
 */

import { spawn } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";
import type { Io } from "./core.ts";

// chezmoi installs dcg here from .chezmoiexternal.toml. A fixed path, not PATH,
// so the guard also runs when the PATH of the agent does not have ~/.local/bin.
export const DCG = join(homedir(), ".local", "bin", "dcg");

export function nodeIo(cwd: string, bin = DCG): Io {
  return {
    dcg: (command) =>
      new Promise((done) => {
        let child;
        // Bun, which runs pi and omp, throws a failed spawn here instead of
        // emitting an error event, and can give a child with no stdout.
        try {
          child = spawn(bin, ["--robot", "test", "--dialect", "posix", command], {
            cwd,
            stdio: ["ignore", "pipe", "ignore"],
            timeout: 5000,
          });
        } catch {
          return done(undefined);
        }
        let stdout = "";
        child.stdout?.on("data", (chunk) => (stdout += chunk));
        // A dcg that is not installed, or a cwd that does not exist.
        child.on("error", () => done(undefined));
        // The timeout kills dcg with a signal, so the code is null.
        child.on("close", (code) => done({ exitCode: code ?? -1, stdout }));
      }),
  };
}
