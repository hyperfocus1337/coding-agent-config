# block-commit-attribution

A `PreToolUse` hook that blocks a `git commit` whose message has a `Co-Authored-By: Claude` trailer. Claude then removes the trailer and runs the commit again.

## Why a hook

`attribution.commit: ""` in `settings.json` stops Claude Code from adding the trailer. It does not stop the model from writing the trailer itself, out of habit. A `permissions.deny` rule such as `Bash(git commit *Co-Authored-By: Claude*)` blocks the `-m` form, but a test on Claude Code 2.1.291 showed that it does not match the trailer in a heredoc body (`git commit -F - <<'EOF'`), which is the form the model uses most.

## How it works

The hook matches the trailer case-insensitively in the raw payload, so an ordinary Bash call exits 0 without a `jq` spawn. When the trailer is present, it reads the command with `jq` and blocks with exit 2 only if `commit` is a whole word in the command. So `git log --grep 'Co-Authored-By: Claude'` and `rg` searches pass. A trailer for another co-author passes.

One gap remains: a message written to a file in an earlier call and passed with `git commit -F <file>` passes. A git `commit-msg` hook is the upgrade path.

## Test

```bash
bash test/test.sh
```
