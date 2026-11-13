"""Stage text replacements on the staged version of one file; never write the working tree."""

import argparse
import os
import subprocess
import sys
from pathlib import Path


def checked(repo, *args, data=None):
    result = subprocess.run(
        ["git", *args], cwd=repo, input=data, check=False, capture_output=True
    )
    if result.returncode:
        raise RuntimeError(result.stderr.decode(errors="replace").strip())
    return result.stdout


def stage(repo, path, pairs):
    entries = checked(repo, "ls-files", "-s", "-z", "--full-name", "--", path)
    entries = [entry for entry in entries.split(b"\0") if entry]
    if len(entries) != 1:
        raise RuntimeError(f"{path}: need one staged file, found {len(entries)}")
    meta, name = entries[0].split(b"\t", 1)
    mode, sha, stage_number = meta.decode().split()
    if stage_number != "0":
        raise RuntimeError(f"{path}: the file has a merge conflict")
    # A symlink or submodule entry holds no file text: read_bytes would follow the link.
    if mode not in ("100644", "100755"):
        raise RuntimeError(f"{path}: mode {mode} is not a regular file")
    # shortcut: the texts are matched against the stored blob, so a file that a clean
    # filter or CRLF conversion changes can fail to match; use the hand method for those.
    text = checked(repo, "cat-file", "blob", sha)
    working = (Path(repo) / path).read_bytes()
    for old, new in pairs:
        old, new = os.fsencode(old), os.fsencode(new)
        if text.count(old) != 1:
            raise RuntimeError(
                f"{path}: old text occurs {text.count(old)} times in the staged version, need 1:\n"
                f"{os.fsdecode(old)}"
            )
        # Catches a typing error only: the text can be elsewhere in the file. The staged diff is the check.
        if new not in working:
            raise RuntimeError(
                f"{path}: new text is not in the working file:\n{os.fsdecode(new)}"
            )
        text = text.replace(old, new)
    blob = checked(repo, "hash-object", "-w", "--no-filters", "--stdin", data=text)
    info = f"{mode},{blob.decode().strip()},{os.fsdecode(name)}"
    checked(repo, "update-index", "--cacheinfo", info)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("-C", dest="repo", default=".", help="repository directory")
    parser.add_argument("path", help="file, relative to the repository directory")
    # REMAINDER: a text that starts with "-" is a text, not an option.
    parser.add_argument(
        "texts", nargs=argparse.REMAINDER, help="pairs: <old text> <new text>"
    )
    args = parser.parse_args()
    if not args.texts or len(args.texts) % 2:
        parser.error("give the texts in pairs: <old text> <new text>")
    try:
        stage(args.repo, args.path, list(zip(args.texts[::2], args.texts[1::2])))
    except (RuntimeError, OSError) as error:
        print(error, file=sys.stderr)
        sys.exit(1)
