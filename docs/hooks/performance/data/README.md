# Run data

`scripts/extensions/hooks/perf.ts` writes this file and the CSV files in this folder, so do not edit them. The [README](../README.md) tells how to read them.

- Date: 2026-10-20 to 2026-10-21
- Commit: `c50c4fc11e39f4492bb1bdcc6335ba543c5d07b6`, the hooks from a `git archive` of it
- Node: v26.10.0
- CPU: Apple M1 Pro
- macOS: 27.0.1 (26A434)
- Run again: `just hooks-perf`
- Input: 623 transcripts, 534 Write, 2928 Edit, and 2 NotebookEdit calls, 2000 of 30646 Bash calls (seed 20261020), 1427 turns that changed files.
- Edit rebuilds: 639 from `originalFile`, 1701 from the text that earlier calls left, 557 from the patch hunks only.

"Did work" per hook:

- format-prettier: prettier changed a file.
- format-org-tables: emacs changed a file.
- format-terraform: terraform changed a file.
- lint-code: reported lint errors.
- lint-prose: blocked on alerts or gave a notice.
- block-secret-commits: blocked the commit.
- enforce-cli-tools: blocked the call.
- block-commit-attribution: blocked the commit.
- track-session-changes: logged a changed file.
- type-check-tsc: blocked the stop with errors.
- type-check-pyrefly: blocked the stop with errors.

Calls left out:

- lint-code, command.ts: 2 calls where command.ts and the core in process disagree on "did work", not counted.
- lint-prose, in process: 33 failed calls that the adapter skips, not counted.
- lint-prose, command.ts: 33 failed calls that the adapter skips, not counted.
- block-commit-attribution, command.ts: not measured, no command.ts.
- track-session-changes, in process: 34 failed calls that the adapter skips, not counted.
- track-session-changes, command.ts: 34 failed calls that the adapter skips, not counted.
- type-check-pyrefly, command.ts: 1 calls where command.ts and the core in process disagree on "did work", not counted.
