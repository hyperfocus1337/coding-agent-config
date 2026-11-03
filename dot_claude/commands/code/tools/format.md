---
description: Check repository formatting, or apply it with an explicit apply argument.
argument-hint: "[check|apply]"
disable-model-invocation: true
---

Run the repository formatting workflow. Mode: $ARGUMENTS

Read and follow `~/.claude/commands/code/tools/shared.txt`. Accept only an empty argument, `check`, or `apply`; empty means `check`. For any other argument, show usage and stop.

Use the formatters, file selection, and configuration of the installed `format-oxfmt`, `format-org-tables`, and `format-code` hooks. Find flags in the installed versions' help. Keep the hook's shfmt `.editorconfig` behavior and fallback style.

## Check

- Use each formatter's non-writing check or diff mode. Report every file that needs formatting, with a diff where available.
- Org tables have no check mode: run the hook's Emacs alignment expression on temporary copies and compare them with the originals. A temporary copy for any formatter must keep the configuration that applies to the original path.
- Never write an original in check mode, also not to restore it.
- End with the next command, `/code:tools:format apply`.

## Apply

Run the same formatters in write mode with the hook's flags and settings. For Org tables, run the alignment expression on the originals. Then run the check again and report remaining differences.
