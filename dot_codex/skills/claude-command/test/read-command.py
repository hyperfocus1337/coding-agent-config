"""Run: python3 dot_codex/skills/claude-command/test/read-command.py"""

# --- Imports ---
import os
import subprocess
import sys
import tempfile
from pathlib import Path

# --- Skill paths and invocation policy ---
skill = Path(__file__).resolve().parents[1]
script = skill / "scripts/read-command.py"
policy = skill / "agents/openai.yaml"
assert policy.read_text().strip() == "policy:\n  allow_implicit_invocation: false"

# --- Command lookup checks ---
with tempfile.TemporaryDirectory() as directory:
    home = Path(directory)
    commands = home / ".claude/commands"
    (commands / "git/commit").mkdir(parents=True)
    (commands / "git/commit/single.md").write_text("selected command\n")
    outside = home / "outside.md"
    outside.write_text("must not read\n")
    (commands / "escape.md").symlink_to(outside)

    def lookup(name):
        return subprocess.run(
            [sys.executable, str(script), name],
            env={**os.environ, "HOME": directory},
            capture_output=True,
            text=True,
        )

    for name in ("git:commit:single", "/git:commit:single"):
        result = lookup(name)
        assert result.returncode == 0, result.stderr
        assert result.stdout == "selected command\n"
    for name in ("", "../outside", "git/commit/single", "git::single", "README", "$(id)"):
        result = lookup(name)
        assert result.returncode != 0 and "Invalid command name" in result.stderr, name
    assert "Command not found" in lookup("missing").stderr
    result = lookup("escape")
    assert result.returncode != 0 and "escapes" in result.stderr
    assert "must not read" not in result.stdout

# --- Argument count checks and result ---
for args in ([], ["one", "two"]):
    result = subprocess.run([sys.executable, str(script), *args], capture_output=True, text=True)
    assert result.returncode != 0 and "Usage:" in result.stderr

print("claude-command: lookup and explicit-only policy checks passed")
