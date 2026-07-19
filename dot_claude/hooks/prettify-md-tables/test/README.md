# Tests

## test.sh

Smoke test for `../hook.mjs`, the PostToolUse hook that re-aligns markdown tables after edits.

Run it:

```bash
bash test.sh
```

The hook is a self-executing script, not a sourceable library, so the test drives it the way Claude Code does: piping a JSON payload on stdin. Each case builds a throwaway git repo in a temp dir, writes a deliberately misaligned table, invokes the hook, and asserts the header cell got padded (proof prettify ran).

Cases cover both dispatch paths and the edge cases:

- **Write/Edit path** (`tool_input.file_path` present): the named md file is prettified; a non-md `file_path` is left untouched.
- **Bash path** (no `file_path`): formats markdown that changed vs HEAD, an untracked new file, and works when `cwd` is a subdirectory of the repo. Gitignored markdown is skipped.
- **Robustness**: malformed stdin and a non-git working dir both exit 0 without touching anything.

Prints `ok`/`FAIL` per case and exits non-zero if any fails, so it doubles as a CI check. Add a case here whenever you change the dispatch logic or the set of files the Bash path formats.
