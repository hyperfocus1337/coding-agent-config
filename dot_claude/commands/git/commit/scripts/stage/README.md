# Staging scripts

[`stage-replace.py`](stage-replace.py) is the Python 3 staging helper for the partial-file step of [`/git:commit:conversation`](../../conversation.md), `multiple`, `split`, and `task`. It applies text replacements to the staged version of one file and writes the result to the index. It never writes the working tree.

```sh
python3 "$HOME/.claude/commands/git/commit/scripts/stage/stage-replace.py" [-C <repo>] <path> '<old text>' '<new text>'
```

Give one more pair per replacement. The helper stops with an error, and leaves the index as it was, in these cases:

- An old text does not occur exactly once in the staged version.
- A new text is not in the working file.
- The path is not in the index, or it has a merge conflict.

Run the checks from the repository root:

```sh
ruff check --no-cache dot_claude/commands/git/commit/scripts/stage/stage-replace.py scripts/inspect/test-stage-replace.py
python3 -B scripts/inspect/test-stage-replace.py
```
