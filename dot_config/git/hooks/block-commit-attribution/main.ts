/**
 * Git commit-msg hook, not an agent hook: blocks a commit whose message has a
 * `Co-Authored-By:` trailer. ~/.config/git/config sets this hook for every
 * commit, and the gate below limits it to agent sessions. Git reads the
 * message from a heredoc, `-m`, `-F <file>`, or the editor into one file, so
 * each form is checked. Design notes: README.md.
 *
 * Run: node main.ts <message file>, from git as a commit-msg hook.
 */

import { readFileSync } from "node:fs";

// The same gate as format-staged-files/main.ts. Your own commits, which can
// have a human co-author, do not get the hook.
const env = process.env;
const agent =
  env.CLAUDECODE === "1" ||
  env.PI_CODING_AGENT === "true" ||
  env.OMPCODE === "1" ||
  !!env.CODEX_THREAD_ID;
if (!agent) process.exit(0);

// Any co-author, so a new agent needs no change. A human co-author is blocked
// too: the user then commits by hand. A trailer starts a line, so a `#`
// comment, a diff line of `commit -v`, and a mention in the body pass.
const TRAILER = /^co-authored-by:/im;

// No file is a broken call of the hook, not a commit, so it throws and blocks.
if (TRAILER.test(readFileSync(process.argv[2]!, "utf8"))) {
  process.stderr.write(
    "Blocked: remove the Co-Authored-By trailer from the commit message and run the commit again. The user does not want attribution lines in commits.\n",
  );
  process.exitCode = 1;
}
