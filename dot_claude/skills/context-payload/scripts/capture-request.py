"""Capture the first API request of an interactive Claude Code session and rank its parts.

Where scripts/context-budget/measure-context.py reconstructs the payload from files on disk, this script
records the real request. It starts `claude` in a pseudo-terminal with the
official OTEL_LOG_RAW_API_BODIES=file:<dir> setting, waits until the MCP
servers settle, types one short prompt, waits for the main-thread response,
then stops the session. No proxy and no dependencies.

The report ranks tool schemas, system prompt blocks, system reminders, memory
files, and the skill and agent listings. The total input tokens are exact (from
the response usage); per-part tokens are that total split by character share.

Caveats:
  * MCP servers connect in the background, and a prompt given on the command
    line goes out before they connect. So the script reads the --debug-file
    log and types the prompt when every server that started has connected or
    failed, or after MCP_WAIT seconds.
  * The script uses an interactive session because --print sends a different
    system prompt and fewer tools. On 2.1.283 the stopped session left no
    transcript, so it does not show in /resume.
  * The request files hold your instructions and account details. They stay in
    the printed directory; delete it when done.

Usage:
  python3 ~/.claude/skills/context-payload/scripts/capture-request.py               # capture in the current directory
  python3 ~/.claude/skills/context-payload/scripts/capture-request.py -- --settings '{"disableWorkflows":true}'
  python3 ~/.claude/skills/context-payload/scripts/capture-request.py --dir /tmp/x  # report on an earlier capture
"""

import argparse
import json
import os
import pty
import re
import select
import signal
import subprocess
import sys
import tempfile
import time
from pathlib import Path

PROMPT = "Reply with the single word ok"
MAIN = "repl_main_thread"
# Above the 30 s default connection timeout (MCP_TIMEOUT), below --timeout.
MCP_WAIT = 60
# The last event per server decides its state. A failure followed by a retry
# line is still pending.
MCP_EVENT = re.compile(
    r'MCP server "([^"]+)": (Starting connection|Successfully connected'
    r"|Connection failed after|.*timed out|.*retry \d)"
)
# Set by a running session for its children. Inherited, they change the payload:
# under `claude -p` the child dropped SendFeedback, EndConversation and
# claude-code-guide (-2,700 tokens on 2.1.283).
PARENT_SESSION_VARS = {
    "AI_AGENT",
    "CLAUDECODE",
    "CLAUDE_CODE_CHILD_SESSION",
    "CLAUDE_CODE_ENTRYPOINT",
    "CLAUDE_CODE_EXECPATH",
    "CLAUDE_CODE_MESSAGING_SOCKET",
    "CLAUDE_CODE_MESSAGING_TOKEN",
    "CLAUDE_CODE_SESSION_ATTENDED",
    "CLAUDE_CODE_SESSION_ID",
    "CLAUDE_EFFORT",
    "CLAUDE_PID",
}


def main_entry(out: Path) -> dict | None:
    index = out / "index.jsonl"
    if not index.exists():
        return None
    for line in index.read_text().splitlines():
        entry = json.loads(line)
        response = entry.get("response_file")
        if entry.get("query_source") == MAIN and response and (out / response).exists():
            return entry
    return None


def debug_log(out: Path) -> str:
    log = out / "debug.log"
    return log.read_text(errors="replace") if log.exists() else ""


def mcp_servers(text: str) -> dict[str, str] | None:
    """Server name to connected, failed, or pending. None until the configs resolve."""
    if "MCP configs resolved" not in text:
        return None
    last = dict(MCP_EVENT.findall(text))
    return {
        name: "connected"
        if event.startswith("Successfully")
        else "pending"
        if event.startswith("Starting") or "retry" in event
        else "failed"
        for name, event in last.items()
    }


def capture(out: Path, claude_args: list[str], timeout: int) -> None:
    env = {k: v for k, v in os.environ.items() if k not in PARENT_SESSION_VARS} | {
        "CLAUDE_CODE_ENABLE_TELEMETRY": "1",
        "OTEL_LOGS_EXPORTER": "none",
        "OTEL_METRICS_EXPORTER": "none",
        "OTEL_TRACES_EXPORTER": "none",
        "OTEL_LOG_RAW_API_BODIES": f"file:{out}",
    }
    master, slave = pty.openpty()
    proc = subprocess.Popen(
        ["claude", "--debug-file", str(out / "debug.log"), *claude_args],
        env=env,
        stdin=slave,
        stdout=slave,
        stderr=slave,
        start_new_session=True,
    )
    os.close(slave)
    start = time.monotonic()
    deadline = start + timeout
    settled_at = sent = None
    try:
        # Drain the TUI output so the child never blocks on a full pty buffer.
        while (
            time.monotonic() < deadline and proc.poll() is None and not main_entry(out)
        ):
            if select.select([master], [], [], 0.5)[0]:
                try:
                    os.read(master, 65536)
                except OSError:
                    break
            if sent:
                continue
            servers = mcp_servers(debug_log(out))
            now = time.monotonic()
            if servers is None or "pending" in servers.values():
                settled_at = None
            elif settled_at is None:
                settled_at = now
            # Wait 1 s after the settle: the next connection batch can still start.
            if (settled_at and now - settled_at >= 1) or now - start > MCP_WAIT:
                os.write(master, PROMPT.encode())
                # A separate write, so the TUI reads Enter as a keypress, not a paste.
                time.sleep(0.5)
                os.write(master, b"\r")
                sent = True
    finally:
        if proc.poll() is None:
            os.killpg(proc.pid, signal.SIGTERM)
        proc.wait()
        os.close(master)


def size(obj) -> int:
    return (
        len(obj) if isinstance(obj, str) else len(json.dumps(obj, ensure_ascii=False))
    )


def texts(content) -> list[str]:
    if isinstance(content, str):
        return [content]
    return [b.get("text", "") for b in content if b.get("type") == "text"]


def listing(text: str, header: str) -> list[tuple[str, int]]:
    """Entries `- name: description` in the block that starts with `header`."""
    start = text.find(header)
    if start < 0:
        return []
    rows = []
    for line in text[start + len(header) :].splitlines()[1:]:
        match = re.match(r"^- ([^:]+(?::[^: ]+)*): ", line)
        if match:
            rows.append((match.group(1), len(line)))
        elif line.strip():
            break
    return rows


def memory_files(text: str) -> list[tuple[str, int]]:
    """Sections `Contents of <path> (...):`, each ending at the next one or at the reminder end."""
    parts = re.split(r"^Contents of (\S+) \(.*\):$", text, flags=re.MULTILINE)
    return [
        (parts[i], len(parts[i + 1].split("</system-reminder>")[0]))
        for i in range(1, len(parts) - 1, 2)
    ]


def table(
    title: str, rows: list[tuple[str, int]], scale: float, limit: int = 0
) -> None:
    rows = sorted(rows, key=lambda r: -r[1])
    print(
        f"\n## {title}  ({sum(r[1] for r in rows):,} chars, ~{round(sum(r[1] for r in rows) * scale):,} tok)"
    )
    for name, chars in rows[:limit] if limit else rows:
        print(f"  {round(chars * scale):>7,}  {chars:>8,}  {name}")
    if limit and len(rows) > limit:
        print(f"  ... {len(rows) - limit} more")


def report(out: Path) -> None:
    entry = main_entry(out)
    if not entry:
        sys.exit(f"No {MAIN} request with a response in {out}")
    request = json.loads((out / entry["request_file"]).read_text())
    usage = json.loads((out / entry["response_file"]).read_text())["usage"]
    total = sum(
        usage.get(k, 0)
        for k in (
            "input_tokens",
            "cache_creation_input_tokens",
            "cache_read_input_tokens",
        )
    )
    parts = {k: request.get(k, []) for k in ("system", "tools", "messages")}
    scale = total / sum(size(v) for v in parts.values())

    print(f"Capture: {out}")
    print(f"Model: {entry['model']}  Input tokens (exact): {total:,}")
    servers = mcp_servers(debug_log(out)) or {}
    print(
        "MCP servers: "
        + (", ".join(f"{n} ({s})" for n, s in sorted(servers.items())) or "none")
    )
    print(
        "Columns: ~tokens, chars, name. ~tokens = exact total split by character share."
    )

    tools = request.get("tools", [])
    table(
        "Tool schemas sent in full",
        [(t["name"], size(t)) for t in tools if not t.get("defer_loading")],
        scale,
    )
    table(
        "Tool schemas deferred (names only until ToolSearch)",
        [(t["name"], size(t)) for t in tools if t.get("defer_loading")],
        scale,
    )

    blocks = [
        (f"system[{i}]: {b['text'][:60].strip()!r}", len(b["text"]))
        for i, b in enumerate(parts["system"])
    ]
    reminders = [
        t for m in parts["messages"] for t in texts(m["content"]) if t != PROMPT
    ]
    blocks += [(f"reminder: {t[:60].strip()!r}", len(t)) for t in reminders]
    table("System prompt and reminder blocks", blocks, scale)

    joined = "\n".join(reminders)
    table("Memory files (CLAUDE.md, rules)", memory_files(joined), scale)
    table(
        "Skill listing",
        listing(joined, "The following skills are available"),
        scale,
        limit=25,
    )
    table("Agent listing", listing(joined, "Available agent types"), scale)
    deferred = re.search(r"before calling them:\n(.*?)\n\n", joined, re.DOTALL)
    if deferred:
        print(
            f"\n## Deferred tools listed by name\n  {', '.join(deferred.group(1).split())}"
        )


def self_check() -> None:
    text = "Available agent types:\n- a: x\n- b:c: yy\n\nrest"
    assert listing(text, "Available agent types") == [("a", 6), ("b:c", 9)]
    assert memory_files(
        "Contents of /p/A.md (user):\nabc\nContents of /q.md (x):\nd\n</system-reminder>x"
    ) == [("/p/A.md", 5), ("/q.md", 3)]
    assert mcp_servers("no configs yet") is None
    assert mcp_servers(
        '[STARTUP] MCP configs resolved\nMCP server "a": Starting connection\n'
        'MCP server "a": Successfully connected (transport: stdio)\n'
        'MCP server "b": Starting connection\nMCP server "b": Connection failed after 5ms\n'
        'MCP server "b": Transient ECONNREFUSED on initial connect — retry 1/3\n'
        'MCP server "c": Starting connection\nMCP server "c": Connection failed after 9ms\n'
    ) == {"a": "connected", "b": "pending", "c": "failed"}


if __name__ == "__main__":
    self_check()
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument(
        "--dir",
        type=Path,
        help="report on an earlier capture instead of starting a session",
    )
    parser.add_argument(
        "--timeout", type=int, default=120, help="seconds to wait for the response"
    )
    parser.add_argument(
        "claude_args", nargs="*", help="extra arguments for claude, after --"
    )
    args = parser.parse_args()
    out = args.dir
    if out is None:
        out = Path(tempfile.mkdtemp(prefix="claude-request-"))
        capture(out, args.claude_args, args.timeout)
        if not main_entry(out):
            sys.exit(
                f"No main-thread response after {args.timeout}s in {out}.\n"
                "Check that `claude` is logged in and that the current directory is trusted."
            )
    report(out)
