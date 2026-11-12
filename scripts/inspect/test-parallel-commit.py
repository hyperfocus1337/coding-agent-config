"""Run: python3 scripts/inspect/test-parallel-commit.py. Uses disposable Git repositories."""

import contextlib
import importlib.util
import io
import os
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

SOURCE = (
    Path(__file__).resolve().parents[2]
    / "dot_claude/commands/git/commit/scripts/parallel/commit-parallel.py"
)
spec = importlib.util.spec_from_file_location("parallel", SOURCE)
assert spec is not None and spec.loader is not None
parallel = importlib.util.module_from_spec(spec)
spec.loader.exec_module(parallel)


class PublishTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        root = Path(self.tmp.name)
        self.repo = root / "repo"
        self.repo.mkdir()
        cwd = Path.cwd()
        os.chdir(self.repo)
        self.addCleanup(os.chdir, cwd)
        self.index = root / "private-index"
        self.patch = root / "unit.patch"
        self.git("init", "-q")
        self.git("config", "user.name", "Test")
        self.git("config", "user.email", "test@example.invalid")
        Path("ours").write_text("base\n")
        Path("other").write_text("base\n")
        self.git("add", "--", "ours", "other")
        self.git("commit", "-qm", "base")
        self.base = self.git("rev-parse", "HEAD").decode().strip()
        parallel.checked("read-tree", self.base, index=self.index)
        Path("ours").write_text("reviewed\n")
        parallel.checked("add", "--", "ours", index=self.index)
        self.patch.write_bytes(
            parallel.checked(*parallel.DIFF, self.base, index=self.index)
        )
        # A later working-tree edit must never enter the reviewed commit.
        Path("ours").write_text("later unreviewed edit\n")
        self.real_git = parallel.git
        self.collisions = 0

    def git(self, *args):
        env = os.environ.copy()
        env.pop("GIT_INDEX_FILE", None)
        return subprocess.run(
            ["git", *args], env=env, capture_output=True, check=True
        ).stdout

    def competing_commit(self, same_path=False):
        index = Path(self.tmp.name) / "competitor-index"
        base = self.git("rev-parse", "HEAD").decode().strip()
        parallel.checked("read-tree", base, index=index)
        name = "ours" if same_path else "other"
        blob = (
            subprocess.run(
                ["git", "hash-object", "-w", "--stdin"],
                input=f"competitor {self.collisions}\n".encode(),
                capture_output=True,
                check=True,
            )
            .stdout.decode()
            .strip()
        )
        parallel.checked(
            "update-index", "--cacheinfo", f"100644,{blob},{name}", index=index
        )
        tree = parallel.checked("write-tree", index=index).decode().strip()
        commit = (
            self.git("commit-tree", tree, "-p", base, "-m", "competitor")
            .decode()
            .strip()
        )
        self.git("update-ref", "HEAD", commit, base)
        self.collisions += 1

    def publish(self):
        with contextlib.redirect_stdout(io.StringIO()) as output:
            parallel.publish(self.index, self.base, self.patch, "feat: reviewed change")
        return output.getvalue()

    def test_normal_commit_preserves_working_tree_and_foreign_stage(self):
        Path("other").write_text("foreign staged\n")
        self.git("add", "--", "other")
        self.assertIn("feat: reviewed change", self.publish())
        self.assertEqual(self.git("show", "HEAD:ours"), b"reviewed\n")
        self.assertEqual(Path("ours").read_text(), "later unreviewed edit\n")
        self.assertEqual(self.git("show", ":ours"), b"reviewed\n")
        self.assertEqual(self.git("show", ":other"), b"foreign staged\n")

    def test_retries_more_than_three_collisions_without_rereading_files(self):
        def collide(*args, **kwargs):
            if args[0] == "update-ref" and self.collisions < 4:
                self.competing_commit()
            return self.real_git(*args, **kwargs)

        with (
            patch.object(parallel, "git", side_effect=collide),
            patch.object(parallel.time, "sleep"),
        ):
            self.publish()
        self.assertEqual(self.collisions, 4)
        self.assertEqual(self.git("show", "HEAD:ours"), b"reviewed\n")
        self.assertEqual(self.git("show", "HEAD:other"), b"competitor 3\n")
        self.assertEqual(self.git("rev-list", "--count", "HEAD").strip(), b"6")

    def test_overlap_stops_without_publishing(self):
        self.competing_commit(same_path=True)
        head = self.git("rev-parse", "HEAD")
        with self.assertRaisesRegex(RuntimeError, "no longer applies cleanly"):
            self.publish()
        self.assertEqual(self.git("rev-parse", "HEAD"), head)
        self.assertEqual(Path("ours").read_text(), "later unreviewed edit\n")

    def test_exhaustion_reports_pending_changes(self):
        def collide(*args, **kwargs):
            if args[0] == "update-ref":
                self.competing_commit()
            return self.real_git(*args, **kwargs)

        with (
            patch.object(parallel, "git", side_effect=collide),
            patch.object(parallel.time, "sleep"),
            self.assertRaisesRegex(RuntimeError, "exhausted retries.*remain pending"),
        ):
            self.publish()
        self.assertEqual(self.collisions, 10)
        self.assertEqual(self.git("show", "HEAD:ours"), b"base\n")

    def test_other_ref_errors_are_not_retried(self):
        def fail(*args, **kwargs):
            if args[0] == "update-ref":
                return subprocess.CompletedProcess(args, 1, b"", b"permission denied")
            return self.real_git(*args, **kwargs)

        with (
            patch.object(parallel, "git", side_effect=fail),
            self.assertRaisesRegex(RuntimeError, "permission denied"),
        ):
            self.publish()
        self.assertEqual(self.git("rev-parse", "HEAD").decode().strip(), self.base)

    def test_refresh_failure_does_not_publish_twice(self):
        resets = []

        def fail(*args, **kwargs):
            if args[0] == "reset":
                resets.append(args)
                return subprocess.CompletedProcess(args, 1, b"", b"index.lock exists")
            return self.real_git(*args, **kwargs)

        with (
            patch.object(parallel, "git", side_effect=fail),
            patch.object(parallel.time, "sleep"),
            self.assertRaisesRegex(
                RuntimeError, "exists, but shared-index refresh failed"
            ),
        ):
            self.publish()
        self.assertEqual(len(resets), 3)
        self.assertEqual(self.git("rev-list", "--count", "HEAD").strip(), b"2")

    def test_retry_preserves_binary_add_delete_and_executable_mode(self):
        Path("binary").write_bytes(b"\0reviewed\xff")
        Path("run.sh").write_text("#!/bin/sh\nexit 0\n")
        Path("run.sh").chmod(0o755)
        parallel.checked("add", "--", "binary", "run.sh", index=self.index)
        parallel.checked(
            "update-index", "--force-remove", "--", "ours", index=self.index
        )
        self.patch.write_bytes(
            parallel.checked(*parallel.DIFF, self.base, index=self.index)
        )
        self.competing_commit()
        self.publish()
        self.assertEqual(self.git("show", "HEAD:binary"), b"\0reviewed\xff")
        self.assertTrue(self.git("ls-tree", "HEAD", "run.sh").startswith(b"100755"))
        self.assertEqual(self.git("ls-tree", "HEAD", "ours"), b"")
        self.assertEqual(Path("ours").read_text(), "later unreviewed edit\n")

    def test_time_limit_stops_before_another_attempt(self):
        with (
            patch.object(parallel.time, "monotonic", side_effect=[0, 31]),
            self.assertRaisesRegex(RuntimeError, "exhausted retries"),
        ):
            self.publish()
        self.assertEqual(self.git("rev-parse", "HEAD").decode().strip(), self.base)

    def test_shared_index_is_rejected(self):
        with self.assertRaisesRegex(RuntimeError, "Use a private index"):
            parallel.publish(Path(".git/index"), self.base, self.patch, "test")

    def test_snapshot_must_match_reviewed_index(self):
        self.patch.write_bytes(b"not the reviewed patch")
        with self.assertRaisesRegex(RuntimeError, "does not match"):
            self.publish()


if __name__ == "__main__":
    unittest.main()
