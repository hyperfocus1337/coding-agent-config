"""Run: python3 scripts/inspect/test-stage-replace.py. Uses disposable Git repositories."""

import importlib.util
import os
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

SOURCE = (
    Path(__file__).resolve().parents[2]
    / "dot_claude/commands/git/commit/scripts/stage/stage-replace.py"
)
spec = importlib.util.spec_from_file_location("stage_replace", SOURCE)
assert spec is not None and spec.loader is not None
stage_replace = importlib.util.module_from_spec(spec)
spec.loader.exec_module(stage_replace)


class StageTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.repo = Path(self.tmp.name)
        self.git("init", "-q")
        self.git("config", "user.name", "Test")
        self.git("config", "user.email", "test@example.invalid")
        (self.repo / "docs").mkdir()
        self.file = self.repo / "docs/notes.md"
        self.file.write_text("Status: draft\nVersion: 1\n")
        self.git("add", "--", "docs/notes.md")
        self.git("commit", "-qm", "base")
        # One hunk that holds an earlier change (Status) and the session change (Version).
        self.file.write_text("Status: review\nVersion: 2\n")

    def git(self, *args):
        return subprocess.run(
            ["git", *args], cwd=self.repo, check=True, capture_output=True
        ).stdout.decode()

    def test_stages_only_the_replacement(self):
        stage_replace.stage(self.repo, "docs/notes.md", [("Version: 1", "Version: 2")])
        self.assertEqual(
            self.git("show", ":docs/notes.md"), "Status: draft\nVersion: 2\n"
        )
        self.assertEqual(self.file.read_text(), "Status: review\nVersion: 2\n")
        self.assertIn("100644", self.git("ls-files", "-s"))

    def test_second_call_builds_on_the_stage(self):
        stage_replace.stage(self.repo, "docs/notes.md", [("Version: 1", "Version: 2")])
        stage_replace.stage(
            self.repo, "docs/notes.md", [("Status: draft", "Status: review")]
        )
        self.assertEqual(self.git("diff", "--", "docs/notes.md"), "")

    def test_private_index_leaves_the_shared_index(self):
        private = self.repo / ".git/private-index"
        with patch.dict(os.environ, {"GIT_INDEX_FILE": str(private)}):
            self.git("read-tree", "HEAD")
            stage_replace.stage(
                self.repo, "docs/notes.md", [("Version: 1", "Version: 2")]
            )
            self.assertIn("+Version: 2", self.git("diff", "--cached"))
        self.assertEqual(self.git("diff", "--cached"), "")

    def test_rejects_wrong_texts_and_leaves_the_stage(self):
        cases = [
            ("Version: 9", "Version: 2"),  # old text is not in the staged version
            ("Version: 1", "Version: 3"),  # new text is not in the working file
            (": ", ":  "),  # old text occurs twice
        ]
        for pair in cases:
            with self.assertRaises(RuntimeError):
                stage_replace.stage(self.repo, "docs/notes.md", [pair])
        with self.assertRaises(RuntimeError):
            stage_replace.stage(self.repo, "missing.md", [("a", "b")])
        self.assertEqual(self.git("diff", "--cached"), "")


if __name__ == "__main__":
    unittest.main()
