"""Publish one reviewed private index; never read or write working-tree files."""

import argparse
import os
import random
import subprocess
import sys
import time
from pathlib import Path

DIFF = ["diff", "--cached", "--binary", "--full-index", "--no-renames"]


def git(*args, index=None):
    env = os.environ.copy()
    env.pop("GIT_INDEX_FILE", None)
    if index is not None:
        env["GIT_INDEX_FILE"] = str(index)
    return subprocess.run(["git", *args], check=False, env=env, capture_output=True)


def checked(*args, index=None):
    result = git(*args, index=index)
    if result.returncode:
        raise RuntimeError(result.stderr.decode(errors="replace").strip())
    return result.stdout


def publish(index, base, patch, subject, body=None):
    index = Path(index).resolve()
    patch = Path(patch).resolve()
    shared_index = Path(
        os.fsdecode(checked("rev-parse", "--git-path", "index")).strip()
    ).resolve()
    if index == shared_index:
        raise RuntimeError("Use a private index, not the shared Git index")
    snapshot = patch.read_bytes()
    if not snapshot or snapshot != checked(*DIFF, base, index=index):
        raise RuntimeError(
            "Snapshot is empty or does not match the reviewed private index"
        )
    paths = checked("diff", "--cached", "--name-only", "-z", base, index=index)
    paths = [os.fsdecode(path) for path in paths.split(b"\0") if path]
    deadline = time.monotonic() + 30
    commit = None
    for attempt in range(10):
        if time.monotonic() >= deadline:
            break
        current = checked("rev-parse", "HEAD").decode().strip()
        if current != base:
            checked("read-tree", current, index=index)
            # Use the saved bytes, not a new diff or git add from the shared working tree.
            result = subprocess.run(
                ["git", "apply", "--cached", "--whitespace=nowarn", "-"],
                input=snapshot,
                check=False,
                env={**os.environ, "GIT_INDEX_FILE": str(index)},
                capture_output=True,
            )
            if result.returncode:
                raise RuntimeError(
                    "Reviewed patch no longer applies cleanly; inspect the overlap before retrying.\n"
                    + result.stderr.decode(errors="replace").strip()
                )
            base = current
        tree = checked("write-tree", index=index).decode().strip()
        args = ["commit-tree", tree, "-p", base, "-m", subject]
        if body:
            args.extend(["-m", body])
        candidate = checked(*args).decode().strip()
        result = git("update-ref", "-m", f"commit: {subject}", "HEAD", candidate, base)
        if not result.returncode:
            commit = candidate
            break
        error = result.stderr.decode(errors="replace").strip()
        if (
            "but expected" not in error
            or checked("rev-parse", "HEAD").decode().strip() == base
        ):
            raise RuntimeError(error)
        if attempt < 9:
            time.sleep(random.uniform(0.05, 0.2))
    if commit is None:
        raise RuntimeError(
            "Concurrent HEAD updates exhausted retries; reviewed changes remain pending"
        )

    # Publication succeeded. Never publish again if refreshing the shared index fails.
    print(f"{commit[:7]} {subject}", flush=True)
    error = ""
    for attempt in range(3):
        result = git("reset", "-q", "--", *paths)
        if not result.returncode:
            return
        error = result.stderr.decode(errors="replace").strip()
        if "index.lock" not in error:
            break
        if attempt < 2:
            time.sleep(0.2)
    raise RuntimeError(
        f"Commit {commit} exists, but shared-index refresh failed for {paths!r}:\n{error}"
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("index")
    parser.add_argument("base")
    parser.add_argument("patch")
    parser.add_argument("subject")
    parser.add_argument("body", nargs="?")
    args = parser.parse_args()
    try:
        publish(args.index, args.base, args.patch, args.subject, args.body)
    except (RuntimeError, OSError) as error:
        print(error, file=sys.stderr)
        sys.exit(1)
