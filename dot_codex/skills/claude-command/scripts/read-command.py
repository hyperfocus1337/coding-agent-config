import re
import sys
from pathlib import Path

if len(sys.argv) != 2:
    raise SystemExit("Usage: read-command.py <command-name>")
name = sys.argv[1].removeprefix("/")
if not re.fullmatch(r"[a-z0-9][a-z0-9-]*(?::[a-z0-9][a-z0-9-]*)*", name):
    raise SystemExit("Invalid command name; use colon-separated names such as git:commit:single")
root = (Path.home() / ".claude/commands").resolve()
path = root.joinpath(*name.split(":")).with_suffix(".md").resolve()
if not path.is_relative_to(root):
    raise SystemExit("Command path escapes ~/.claude/commands")
if not path.is_file():
    raise SystemExit(f"Command not found: {name}")
print(path.read_text(), end="")
