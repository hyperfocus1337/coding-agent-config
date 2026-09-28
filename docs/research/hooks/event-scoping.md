# Hook event scoping: PostToolUse or Stop

Which event each format, lint, and type-check hook in [`dot_claude/settings.json`](../../../dot_claude/settings.json) should use, and why. For the full list of events and what each one can change, see [hook events](../agents/hook-events.md).

Measured on 2026-09-28 from 205 session transcripts in `~/.claude/projects/`, dated 2026-08-30 to 2026-09-27. The sessions have 4,860 Bash, 167 Edit, and 91 Write calls. `lint-prose` was added on 2026-09-26, so it has less data than the other hooks.

## Recommendation

| Hook                       | Event       | Reason                                                                                      |
| -------------------------- | ----------- | ------------------------------------------------------------------------------------------- |
| `format-all-languages`     | PostToolUse | The next Edit matches text on disk, so the file must be formatted before that Edit.         |
| `format-org-tables`        | PostToolUse | Same as `format-all-languages`.                                                             |
| `lint-all-languages`       | PostToolUse | A finding is local to one file. The model fixes it best while the edit is still in context. |
| `lint-prose`               | PostToolUse | Same as `lint-all-languages`.                                                               |
| `type-check-all-languages` | Stop        | A type checker checks the whole project. After each edit, it prints the same errors again.  |

Use Stop only for a check that needs the whole project. Use PostToolUse for a check that looks at one file.

## Measured output

Only some hook output goes to the model. A blocking error (exit 2) sends stderr to the model. A `hookSpecificOutput.additionalContext` value also goes to the model. The stdout of a hook that exits 0 goes to the transcript only.

| Output that goes to the model        | Count | Size                        |
| ------------------------------------ | ----- | --------------------------- |
| Blocking errors (exit 2)             | 21    | 15 KB total, largest 1.9 KB |
| `additionalContext` from PostToolUse | 130   | 55 KB total                 |
| All tool results, for comparison     |       | 15.9 MB                     |

Hook output is approximately 0.4% of the text that the model reads from tools. The quantity of output does not confuse the model. Some of the output is incorrect or causes extra work, and the next section gives these problems.

| Hook                   | Median run time | Longest run |
| ---------------------- | --------------- | ----------- |
| `format-all-languages` | 394 ms          | 1,653 ms    |
| `lint-all-languages`   | 67 ms           | 147 ms      |
| Stop type check        | 328 ms          | 1,504 ms    |

## Problems found

The event choice did not cause these problems. A move to Stop does not fix them.

1. **Vale shim errors.** 5 of the 21 blocking errors are `mise ERROR No version is set for shim: vale` from `lint-prose`. The preflight `command -v vale` passes because the mise shim exists, but mise has no Vale version for that directory. A preflight that runs `vale --version` stops this.
2. **Formatting after a commit.** Approximately 60 of the 130 `additionalContext` messages say "Prettier reformatted markdown after your commit". This occurs when one Bash command writes a file and commits it: Prettier runs after the commit, and the model must amend. Each message costs at least one more tool call. Stop does not fix this, because the commit also occurs before Stop. The fix is to format before the commit. [`format-staged-files`](../../../dot_claude/hooks/format-staged-files/README.md) now does this as a git pre-commit hook, set for agent sessions only.
3. **Unfinished edits.** 1 of the 21 blocking errors came from an edit that was not complete: ShellCheck SC2034 flagged a variable as unused, and the next edit used it. This is the one case that Stop prevents. It is rare, so it does not justify the move.

The other 15 blocking errors were correct findings: Ruff SIM115, F841, EXE001, and FURB167, ShellCheck SC2154 and SC1007, and two Vale paragraph-length alerts.

## Why Stop is worse for per-file checks

- **Late formatting.** A formatter on Stop changes files after the model last read them. Every commit that the model makes during the turn keeps the unformatted text.
- **Batched findings.** On Stop, all findings of the turn arrive at the same time, after the model has left the code that caused them.
- **One retry.** The Stop hooks exit 0 when `stop_hook_active` is true, to prevent a loop. The model gets one retry. After that retry, a finding that is still there passes without a report.
- **Wider file scope.** A Stop payload has no file path, so the hook uses `git diff HEAD`. That diff also holds work from before the session, which adds unrelated findings.
- **No speed gain.** `lint-all-languages` takes 67 ms at the median, so running it once per turn saves almost no time.

## Reproduce the measurement

Claude Code writes each hook run to the session transcript as an `attachment` entry of type `hook_success`, `hook_blocking_error`, or `hook_additional_context`. This command counts the runs and the output size per event, hook, and type:

```sh
cd ~/.claude/projects && rg -N --no-filename '"type":"hook_(success|blocking_error|additional_context)"' -g '*.jsonl' \
  | jq -r '.attachment as $a | select($a != null)
      | ($a.command // $a.blockingError.command // $a.hookName) as $cmd
      | ($cmd | capture("hooks/(?<n>[^/]+)/").n // $cmd) as $name
      | [$a.hookEvent, $name, $a.type,
         (($a.blockingError.blockingError // ($a.content | tostring) // "") | length),
         ($a.durationMs // 0)] | @tsv' \
  | mlr --itsv --implicit-csv-header --opprint label event,hook,type,bytes,ms \
      then stats1 -a count,sum,max,p50 -f bytes,ms -g event,hook,type
```

A `hook_additional_context` entry has no command, so the command groups it by `hookName`, for example `PostToolUse:Bash`.
