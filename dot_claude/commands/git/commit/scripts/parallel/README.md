# Parallel commit scripts

[`commit-parallel.py`](commit-parallel.py) is the Python 3 publish helper for [`/git:commit:parallel`](../../parallel.md). It publishes a reviewed private index, retries concurrent `HEAD` updates with the saved patch, and refreshes only the committed paths in the shared index. Run it from the repository root; the slash command supplies its index, base, patch, and commit message.

Chezmoi installs the helper at `~/.claude/commands/git/commit/scripts/parallel/commit-parallel.py`. The `.ruff_cache/` and `__pycache__/` directories beside it are generated caches, not source files. Git and chezmoi exclude these directories.

Run the checks from the repository root:

```sh
ruff check --no-cache dot_claude/commands/git/commit/scripts/parallel/commit-parallel.py scripts/inspect/test-parallel-commit.py
python3 -B scripts/inspect/test-parallel-commit.py
```
