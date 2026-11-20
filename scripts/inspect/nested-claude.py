"""Drive one interactive Claude Code session in a pty until its transcript shows end_turn.

Usage: python3 -I nested-claude.py CWD PROMPT [CLAUDE_ARGS...]
Prints one JSON line: session, done, answered dialogs, transcript path, seconds.
env: CODE_MODE (on or off, default on), RAW (file for the raw pty output),
INTERRUPT_AFTER (s: send Esc, then stop 25 s later), KEEP_SECS (s to stay open after end_turn,
default 5).

Gotchas, measured on Claude Code 2.1.328:
- An inherited CLAUDE_CODE_CHILD_SESSION turns off transcript saving, so each CLAUDE* variable
  goes, except the config and plugin ones.
- The trust dialog and the code mode opt-in default to No: send Down, then Enter.
- The settings.json env block overrides CLAUDE_CODE_PLUGIN_DIRS: load a probe mod with
  --plugin-dir DIR in CLAUDE_ARGS.
"""

import json, os, pty, re, select, sys, time, uuid

cwd, prompt = sys.argv[1], sys.argv[2]
interrupt = float(os.environ.get("INTERRUPT_AFTER", "0"))
keep = float(os.environ.get("KEEP_SECS", "5"))
sid = str(uuid.uuid4())
allowed = {
    "CLAUDE_CONFIG_DIR",
    "CLAUDE_CODE_PLUGIN_DIRS",
    "CLAUDE_CODE_PLUGIN_GIT_TIMEOUT_MS",
    "CLAUDE_CODE_DISABLE_FEEDBACK_SURVEY",
}
env = {
    k: v for k, v in os.environ.items() if not k.startswith("CLAUDE") or k in allowed
}
env["CLAUDE_CODE_EXPERIMENTAL_CODE_MODE"] = (
    "0" if os.environ.get("CODE_MODE") == "off" else "1"
)
transcript = os.path.expanduser(
    f"~/.claude/projects/{cwd.replace('/', '-').replace('.', '-')}/{sid}.jsonl"
)
pid, fd = pty.fork()
if pid == 0:
    os.chdir(cwd)
    os.execvpe(
        "claude",
        [
            "claude",
            "--session-id",
            sid,
            "--dangerously-skip-permissions",
            *sys.argv[3:],
            prompt,
        ],
        env,
    )
raw = open(os.environ["RAW"], "wb") if os.environ.get("RAW") else None
buf, answered, start, done, sent_esc = "", set(), time.time(), False, False
end_at = start + 540
while time.time() < end_at:
    r, _, _ = select.select([fd], [], [], 1)
    if r:
        try:
            data = os.read(fd, 65536)
        except OSError:
            break
        if raw:
            raw.write(data)
            raw.flush()
        # Strip CSI and OSC escapes, then keep letters only, so dialog text matches across redraws.
        text = re.sub(
            r"\x1b(\[[0-9;?<>]*[A-Za-z]|\][^\x07]*\x07)",
            "",
            data.decode("utf-8", "replace"),
        )
        buf = (buf + re.sub(r"[^a-z]", "", text.lower()))[-4000:]
        for key in ("trustthisfolder", "turnoncodemode"):
            if key not in answered and key in buf and "entertoconfirm" in buf:
                time.sleep(1)
                os.write(fd, b"\x1b[B")
                time.sleep(0.5)
                os.write(fd, b"\r")
                answered.add(key)
                buf = ""
    if interrupt and not sent_esc and time.time() - start > interrupt:
        os.write(fd, b"\x1b")
        sent_esc = True
        end_at = time.time() + 25
    if not done and os.path.exists(transcript):
        for line in open(transcript):
            m = json.loads(line).get("message", {})
            if m.get("role") == "assistant" and m.get("stop_reason") == "end_turn":
                done = True
                end_at = min(end_at, time.time() + keep)
os.write(fd, b"\x03")
time.sleep(1)
os.write(fd, b"\x03")
time.sleep(2)
try:
    os.kill(pid, 9)
except ProcessLookupError:
    pass
print(
    json.dumps(
        {
            "session": sid,
            "done": done,
            "esc": sent_esc,
            "answered": sorted(answered),
            "transcript": transcript,
            "secs": round(time.time() - start),
        }
    )
)
