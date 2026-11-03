/**
 * Command hook for Codex: reads the hook payload on stdin and lints the prose
 * in the files the call changed. On apply_patch, through
 * dot_codex/hooks/apply-patch.ts, the file is the one that the payload names.
 * On Bash, the files come from the log of track-session-changes: the Bash
 * entry runs track-session-changes first, then this file with the time
 * before it, because Codex runs the handlers of one event at the same time.
 * Exits 2 with the alerts on stderr, so they reach the model. Exits 1 with a
 * message for the user that does not block: a Vale failure, a missing Vale
 * config, or alerts this session already reported. Exits 0 and prints
 * nothing otherwise.
 *
 * Run: node command.ts [<since>], with <since> in seconds since the epoch,
 * for a Bash payload.
 */

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { check, shellFiles } from "./core.ts";
import { nodeIo, nodeSettings } from "./io.ts";

const payload = JSON.parse(readFileSync(0, "utf8")) as {
  session_id?: unknown;
  tool_name?: unknown;
  tool_input?: { file_path?: unknown; command?: unknown };
};
const text = (value: unknown) => (typeof value === "string" ? value : undefined);
const session = text(payload.session_id);
const since = process.argv[2] ?? "";
const io = nodeIo();
const settings = nodeSettings();
// A Bash payload without a time has no safe start, so it checks nothing.
const files =
  payload.tool_name !== "Bash"
    ? [text(payload.tool_input?.file_path)]
    : /^\d+$/.test(since) && session
      ? await shellFiles(
          io,
          { home: homedir(), agent: "codex", session },
          "Bash",
          Number(since) * 1000,
          text(payload.tool_input?.command) ?? "",
        )
      : [];
const blocks: string[] = [];
const notices: string[] = [];
for (const file of files) {
  const { block, notice } = await check(file, session, io, settings);
  if (block) blocks.push(block);
  if (notice) notices.push(notice);
}
const message = blocks.length ? blocks.join("") : notices.join("");
if (message) {
  process.stderr.write(message);
  process.exitCode = blocks.length ? 2 : 1;
}
