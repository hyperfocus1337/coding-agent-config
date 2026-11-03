---
description: Lint repository code and prose, or apply safe automatic fixes with fix.
argument-hint: "[check|fix]"
disable-model-invocation: true
---

Run the repository lint workflow. Mode: $ARGUMENTS

Read and follow `~/.claude/commands/code/tools/shared.txt`. Accept only an empty argument, `check`, or `fix`; empty means `check`. For any other argument, show usage and stop.

Use the tools, severity levels, file routing, and configuration of the installed `lint-code` and `lint-prose` hooks. Gotchas:

- yamllint or ansible-lint: use the hook's path and content detection and its bundled configuration selection.
- tflint: run in each module directory, with the module's configuration or the hook's bundled fallback. Report each module finding once.
- Vale: inspect the `lint-prose` wrapper before you call it. Check all eligible prose, without the hook's changed-paragraph filter or session deduplication.

## Check

Run the linters without fix flags. If a safe automatic fix is available, end with the next command, `/code:tools:lint fix`.

## Fix

Find each tool's safe fix mode in its installed help, and apply only fixes documented as safe. A tool without a safe fix mode stays report-only. Lint again after fixing, and report the tools without safe fixes.
