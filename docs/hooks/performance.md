# Hook performance

This document gives the run time of each TypeScript hook in [`dot_claude/hooks/`](../../dot_claude/hooks/README.md) for each tool call. [`scripts/extensions/hooks/perf.ts`](../../scripts/extensions/hooks/perf.ts) replays the tool calls of the Claude Code transcripts in `~/.claude/projects/*/*.jsonl` through each hook. `just hooks-perf` runs it again and replaces the part between the `perf:begin` and `perf:end` markers. The text outside the markers is written by hand, so check the findings against the new numbers after a run.

## Method

- **Paths:** "in process" calls `core.ts` with the Node functions of `io.ts`, as `pi.ts` does. "command.ts" starts `node command.ts` with the payload on stdin, as Codex and the Claude Code command hooks do. The script does not time `guard.sh`, the `command -v node` shell wrapper, or the Bash versions of the hooks.
- **Code:** the hooks come from a `git archive` of the commit below. Uncommitted edits in the work tree do not count.
- **Events:** each hook gets the events of its `hooks/register.ts`, `pi.ts`, and `command.ts`. A hook gets every Write and Edit call, the same 2000 Bash calls (a random sample with a fixed seed), and one Stop after each turn that changed files.
- **Fixtures:** the script rebuilds each session in `~/.cache/hook-perf/fixtures/`, not under `/tmp` or `$TMPDIR`, because the formatters skip those folders. Each path in a payload or a command points into the fixture. A path under `/tmp` maps under the `TMPDIR` of the hooks, so the hooks still skip it. When the transcript names a git branch, the working folder is a git repository with the files from before the session as its first commit.
- **File text:** a file gets its text from the transcript only: the content of a Write, the `originalFile` of an Edit, a full Read, and the patch hunks of an Edit or of a Bash call (`bashEditDiff`). A Bash call that commits gets a commit in the fixture. Before a Bash call, each file gets the age it had at that point in the session, because three hooks take a Bash path only when its mtime is at most 120 s old.
- **Safety:** no historical Bash command runs. A hook gets it only as payload. In process, a write outside `~/.cache/hook-perf/` is refused, and the command.ts pass skips that call.
- **Order:** the hooks run one at a time, each path after 20 warm-up calls. The `durationMs` values and the hook output in the transcripts are not used.
- **Columns:** "Did work" is measured on each path. "Tool ran" (the hook started its formatter, linter, or scanner) and "Off" (the tool could not start) come from the in-process run of the same call. A call that is off is not counted.

## Results

<!-- perf:begin -->

- Date: 2026-10-20 to 2026-10-21
- Commit: `c50c4fc11e39f4492bb1bdcc6335ba543c5d07b6`, the hooks from a `git archive` of it
- Node: v26.10.0
- CPU: Apple M1 Pro
- macOS: 27.0.1 (26A434)
- Run again: `just hooks-perf`
- Input: 623 transcripts, 534 Write, 2928 Edit, and 2 NotebookEdit calls, 2000 of 30646 Bash calls (seed 20261020), 1427 turns that changed files.
- Edit rebuilds: 639 from `originalFile`, 1701 from the text that earlier calls left, 557 from the patch hunks only.

| Hook                     | Path       | Event                         |                  Calls | p50 ms | p95 ms | p99 ms | Max ms | Did work | Tool ran | Off |
| ------------------------ | ---------- | ----------------------------- | ---------------------: | -----: | -----: | -----: | -----: | -------: | -------: | --: |
| format-prettier          | in process | PostToolUse Edit              |                   2928 |   0.01 |    110 |    135 |    347 |      2 % |     10 % |   0 |
| format-prettier          | in process | PostToolUse Bash              |                   2000 |     94 |    235 |    374 |    905 |      3 % |      8 % |     |
| format-prettier          | in process | PostToolUse Write             |                    534 |   0.01 |    109 |    144 |    229 |     10 % |     28 % |     |
| format-prettier          | command.ts | PostToolUse Edit              |                   2928 |     34 |    150 |    179 |    522 |      2 % |     10 % |   0 |
| format-prettier          | command.ts | PostToolUse Bash              |                   2000 |    121 |    261 |    465 |   1052 |      3 % |      8 % |     |
| format-prettier          | command.ts | PostToolUse Write             |                    534 |     35 |    155 |    189 |    394 |     10 % |     28 % |     |
| format-org-tables        | in process | PostToolUse Edit              |                   2928 |   0.02 |    710 |    829 |    984 |     18 % |     22 % |   0 |
| format-org-tables        | in process | PostToolUse Bash              |                   2000 |   0.06 |    684 |    770 |   1081 |      4 % |      6 % |     |
| format-org-tables        | in process | PostToolUse Write             |                    534 |   0.01 |    693 |    787 |   1005 |     18 % |     19 % |     |
| format-org-tables        | command.ts | PostToolUse Edit              |                   2928 |     34 |    750 |    893 |  25134 |     18 % |     22 % |   0 |
| format-org-tables        | command.ts | PostToolUse Bash              |                   2000 |     34 |    727 |    798 |   1190 |      4 % |      6 % |     |
| format-org-tables        | command.ts | PostToolUse Write             |                    534 |     34 |    729 |    848 |   1028 |     18 % |     19 % |     |
| format-terraform         | in process | PostToolUse Edit              |                   2928 |   0.01 |   0.03 |   0.03 |   0.07 |      0 % |      0 % |   0 |
| format-terraform         | in process | PostToolUse Bash              |                   2000 |   0.04 |   0.12 |   0.19 |   0.51 |      0 % |      0 % |     |
| format-terraform         | in process | PostToolUse Write             |                    534 |   0.01 |   0.03 |   0.03 |   0.04 |      0 % |      0 % |     |
| format-terraform         | command.ts | PostToolUse Edit              |                   2928 |     34 |     39 |    103 |    166 |      0 % |      0 % |   0 |
| format-terraform         | command.ts | PostToolUse Bash              |                   2000 |     34 |     39 |     89 |    185 |      0 % |      0 % |     |
| format-terraform         | command.ts | PostToolUse Write             |                    534 |     34 |     39 |     70 |    125 |      0 % |      0 % |     |
| lint-code                | in process | PostToolUse Edit              |                   2920 |   0.04 |     30 |     79 |    238 |      2 % |      6 % |   0 |
| lint-code                | in process | PostToolUse Bash              |                   2000 |   0.05 |   0.18 |     30 |    624 |      1 % |      1 % |     |
| lint-code                | in process | PostToolUse Write             |                    534 |   0.05 |     61 |     83 |    208 |      1 % |     11 % |     |
| lint-code                | command.ts | PostToolUse Edit              |                   2920 |     34 |     97 |    119 |    354 |      2 % |      6 % |   0 |
| lint-code                | command.ts | PostToolUse Bash              |                   2000 |     34 |     40 |    107 |    467 |      1 % |      1 % |     |
| lint-code                | command.ts | PostToolUse Write             |                    534 |     34 |    101 |    147 |    288 |      1 % |     11 % |     |
| lint-prose               | in process | PostToolUse Edit              |                   2889 |    233 |    299 |    630 |    829 |     15 % |     50 % |   0 |
| lint-prose               | in process | PostToolUse Write             |                    532 |   0.03 |    284 |    305 |    698 |      7 % |     50 % |     |
| lint-prose               | command.ts | PostToolUse Edit              |                   2889 |    272 |    343 |    661 |    901 |     15 % |     50 % |   0 |
| lint-prose               | command.ts | PostToolUse Write             |                    532 |     78 |    328 |    530 |    716 |      7 % |     50 % |     |
| block-secret-commits     | in process | PreToolUse Bash               |                   2000 |   0.01 |   0.05 |    284 |    825 |      0 % |      5 % |   0 |
| block-secret-commits     | command.ts | PreToolUse Bash               |                   2000 |     34 |    137 |    362 |  25470 |      0 % |      5 % |   0 |
| enforce-cli-tools        | in process | PreToolUse Bash               |                   2000 |   0.04 |   0.06 |   0.07 |   0.38 |      0 % |      0 % |   0 |
| enforce-cli-tools        | command.ts | PreToolUse Bash               |                   2000 |     34 |     39 |     71 |    166 |      0 % |      0 % |   0 |
| block-commit-attribution | in process | PreToolUse Bash               |                   2000 |   0.00 |   0.00 |   0.00 |   0.40 |      0 % |      0 % |   0 |
| block-commit-attribution | command.ts | -                             | skipped: no command.ts |        |        |        |        |          |          |     |
| track-session-changes    | in process | SessionStart                  |                    623 |   0.15 |   0.29 |   0.57 |   1.54 |      0 % |      0 % |   0 |
| track-session-changes    | in process | PostToolUse Edit              |                   2889 |     23 |     45 |     96 |    267 |    100 % |    100 % |     |
| track-session-changes    | in process | PreToolUse + PostToolUse Bash |                   2000 |     48 |     93 |    180 |    504 |     12 % |    100 % |     |
| track-session-changes    | in process | PostToolUse Write             |                    532 |     34 |     65 |    190 |    352 |    100 % |    100 % |     |
| track-session-changes    | in process | PostToolUse NotebookEdit      |                      1 |     41 |     41 |     41 |     41 |    100 % |    100 % |     |
| track-session-changes    | command.ts | SessionStart                  |                    623 |     35 |     40 |     90 |    145 |      0 % |      0 % |   0 |
| track-session-changes    | command.ts | PostToolUse Edit              |                   2889 |     65 |     86 |    175 |    324 |    100 % |    100 % |     |
| track-session-changes    | command.ts | PreToolUse + PostToolUse Bash |                   2000 |    140 |    182 |    386 |    687 |     12 % |    100 % |     |
| track-session-changes    | command.ts | PostToolUse Write             |                    532 |     79 |    101 |    232 |    332 |    100 % |    100 % |     |
| track-session-changes    | command.ts | PostToolUse NotebookEdit      |                      1 |     96 |     96 |     96 |     96 |    100 % |    100 % |     |
| type-check-tsc           | in process | Stop                          |                   1427 |     55 |     73 |    198 |    325 |      0 % |      0 % |   0 |
| type-check-tsc           | command.ts | Stop                          |                   1427 |     84 |    115 |    290 |    462 |      0 % |      0 % |   0 |
| type-check-pyrefly       | in process | Stop                          |                   1427 |     55 |     72 |    280 |    795 |      0 % |      1 % |   0 |
| type-check-pyrefly       | command.ts | Stop                          |                   1427 |     83 |    122 |    328 |    543 |      0 % |      1 % |   0 |

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
- track-session-changes, in process: 34 failed calls that the adapter skips, not counted.
- track-session-changes, command.ts: 34 failed calls that the adapter skips, not counted.
- type-check-pyrefly, command.ts: 1 calls where command.ts and the core in process disagree on "did work", not counted.

### Slowest cases

| Hook                     | Path       | Event                         |    ms | Extension         |     Size | Lines |
| ------------------------ | ---------- | ----------------------------- | ----: | ----------------- | -------: | ----: |
| format-prettier          | command.ts | PostToolUse Bash              |  1052 | Bash command      |  5.8 KiB |    96 |
| format-prettier          | command.ts | PostToolUse Bash              |   937 | Bash command      |    285 B |     2 |
| format-prettier          | in process | PostToolUse Bash              |   905 | Bash command      |    285 B |     2 |
| format-prettier          | in process | PostToolUse Bash              |   886 | Bash command      |  1.1 KiB |    18 |
| format-prettier          | in process | PostToolUse Bash              |   848 | Bash command      |  1.1 KiB |     1 |
| format-org-tables        | command.ts | PostToolUse Edit              | 25134 | .json             |  6.6 KiB |   257 |
| format-org-tables        | command.ts | PostToolUse Edit              |  1253 | .org (hunks only) |    770 B |     7 |
| format-org-tables        | command.ts | PostToolUse Bash              |  1190 | Bash command      |    897 B |    10 |
| format-org-tables        | command.ts | PostToolUse Edit              |  1169 | .org (hunks only) |    864 B |     8 |
| format-org-tables        | in process | PostToolUse Bash              |  1081 | Bash command      |  1.3 KiB |    12 |
| format-terraform         | command.ts | PostToolUse Bash              |   185 | Bash command      |    463 B |     1 |
| format-terraform         | command.ts | PostToolUse Edit              |   166 | .md               | 13.1 KiB |   127 |
| format-terraform         | command.ts | PostToolUse Bash              |   163 | Bash command      |    585 B |    12 |
| format-terraform         | command.ts | PostToolUse Edit              |   158 | .json             |  6.4 KiB |   252 |
| format-terraform         | command.ts | PostToolUse Bash              |   156 | Bash command      |    258 B |     1 |
| lint-code                | in process | PostToolUse Bash              |   624 | Bash command      |    148 B |     1 |
| lint-code                | command.ts | PostToolUse Bash              |   467 | Bash command      |  2.8 KiB |    69 |
| lint-code                | in process | PostToolUse Bash              |   431 | Bash command      |  2.8 KiB |    69 |
| lint-code                | command.ts | PostToolUse Edit              |   354 | .ts               | 43.7 KiB |  1242 |
| lint-code                | command.ts | PostToolUse Edit              |   327 | .sh               |  5.7 KiB |   152 |
| lint-prose               | command.ts | PostToolUse Edit              |   901 | .org              |  3.2 KiB |    16 |
| lint-prose               | in process | PostToolUse Edit              |   829 | .org              | 24.0 KiB |   246 |
| lint-prose               | in process | PostToolUse Edit              |   816 | .org (hunks only) |  6.2 KiB |    34 |
| lint-prose               | command.ts | PostToolUse Edit              |   804 | .org              | 10.0 KiB |    81 |
| lint-prose               | in process | PostToolUse Edit              |   795 | .org (hunks only) |    344 B |     6 |
| block-secret-commits     | command.ts | PreToolUse Bash               | 25470 | Bash command      |    640 B |    13 |
| block-secret-commits     | command.ts | PreToolUse Bash               | 25042 | Bash command      |    250 B |     1 |
| block-secret-commits     | command.ts | PreToolUse Bash               |   904 | Bash command      |    375 B |     2 |
| block-secret-commits     | in process | PreToolUse Bash               |   825 | Bash command      |    506 B |     1 |
| block-secret-commits     | command.ts | PreToolUse Bash               |   766 | Bash command      |    843 B |    14 |
| enforce-cli-tools        | command.ts | PreToolUse Bash               |   166 | Bash command      |    114 B |     1 |
| enforce-cli-tools        | command.ts | PreToolUse Bash               |   164 | Bash command      |    169 B |     1 |
| enforce-cli-tools        | command.ts | PreToolUse Bash               |   152 | Bash command      |    682 B |    13 |
| enforce-cli-tools        | command.ts | PreToolUse Bash               |   135 | Bash command      | 16.2 KiB |   316 |
| enforce-cli-tools        | command.ts | PreToolUse Bash               |   103 | Bash command      |  3.5 KiB |    87 |
| block-commit-attribution | in process | PreToolUse Bash               |  0.40 | Bash command      |    161 B |     1 |
| block-commit-attribution | in process | PreToolUse Bash               |  0.02 | Bash command      |    162 B |     1 |
| block-commit-attribution | in process | PreToolUse Bash               |  0.01 | Bash command      | 16.2 KiB |   316 |
| block-commit-attribution | in process | PreToolUse Bash               |  0.01 | Bash command      |    254 B |     1 |
| block-commit-attribution | in process | PreToolUse Bash               |  0.01 | Bash command      | 15.8 KiB |    64 |
| track-session-changes    | command.ts | PreToolUse + PostToolUse Bash |   687 | Bash command      |    651 B |    10 |
| track-session-changes    | command.ts | PreToolUse + PostToolUse Bash |   562 | Bash command      |    185 B |     1 |
| track-session-changes    | command.ts | PreToolUse + PostToolUse Bash |   523 | Bash command      |  3.7 KiB |    19 |
| track-session-changes    | command.ts | PreToolUse + PostToolUse Bash |   516 | Bash command      |     42 B |     1 |
| track-session-changes    | command.ts | PreToolUse + PostToolUse Bash |   507 | Bash command      |    782 B |     7 |
| type-check-tsc           | command.ts | Stop                          |   462 | .el .org          | 33.2 KiB |   230 |
| type-check-tsc           | command.ts | Stop                          |   459 | .el (hunks only)  |  1.7 KiB |    27 |
| type-check-tsc           | command.ts | Stop                          |   455 | .org              |  6.3 KiB |    70 |
| type-check-tsc           | command.ts | Stop                          |   448 | .el               | 12.0 KiB |   289 |
| type-check-tsc           | command.ts | Stop                          |   440 | .org              | 15.6 KiB |   208 |
| type-check-pyrefly       | in process | Stop                          |   795 | .py .sh           |  2.9 KiB |    67 |
| type-check-pyrefly       | in process | Stop                          |   548 | .md .py .sh       | 17.6 KiB |   323 |
| type-check-pyrefly       | command.ts | Stop                          |   543 | .org              |  1.1 KiB |    12 |
| type-check-pyrefly       | command.ts | Stop                          |   525 | .md .py .sh       | 17.6 KiB |   323 |
| type-check-pyrefly       | command.ts | Stop                          |   440 | .fish             |  1.7 KiB |    28 |

<!-- perf:end -->

## Findings

An average session in these transcripts has 49.2 Bash calls, 4.7 Edit calls, 0.9 Write calls, and 2.3 Stops. With the mean time of each row and the path that Claude Code uses, the hooks take 15.2 s for each session, or about 0.27 s for each tool call. The means leave out the stalls of more than 2 s (see the last item). These hooks cost the most time:

| Hook                    | Path in Claude Code | Time per session | Main cost                       |
| ----------------------- | ------------------- | ---------------: | ------------------------------- |
| `format-prettier`       | in process          |            5.7 s | The Bash sweep, 114 ms per call |
| `format-org-tables`     | in process          |            2.9 s | One Emacs start, about 700 ms   |
| `track-session-changes` | in process          |            2.8 s | Two git snapshots per Bash call |
| `block-secret-commits`  | command.ts          |            2.5 s | One Node start per Bash call    |
| `lint-prose`            | in process          |            0.8 s | Two Vale starts per prose file  |

Each other hook takes 0.2 s or less for each session. For `type-check-tsc` and `type-check-pyrefly`, this number holds almost no type check, so do not rank them as cheap (see below).

- **format-prettier on Bash.** Each Bash call costs 114 ms (mean, in process), but Prettier runs on only 8 % of them. The sweep starts `git rev-parse` for the cwd and for each absolute path in the command, then `git diff` and `git ls-files` in each repository it finds. The `ABSOLUTE` pattern in `core.ts` also matches the end of a relative path, see the possible bugs below. A Write or Edit costs almost nothing when the extension does not match, and about 110 ms (p95) when Prettier runs.
- **format-org-tables.** An Emacs batch run takes 680 ms to 770 ms (p95), most of it the start of Emacs. In these transcripts, Emacs runs on 22 % of the Edit calls and 19 % of the Write calls, because many sessions edit Org files with tables. The hook reads the file first and starts Emacs only for a file with a table line, so a file without a table costs less than 0.1 ms.
- **track-session-changes.** Each Bash call takes a snapshot before and after: `git add -A` into a copy of the session index, then a diff. That costs 53 ms in process and 149 ms through `command.ts`, which starts Node twice. Each Edit costs 25 ms and each Write 37 ms, for `git hash-object`.
- **block-secret-commits.** The core takes 0.01 ms for a command that does not commit. In Claude Code it is a command hook, so each Bash call pays one Node start of about 34 ms, plus `guard.sh`, which this run does not time. Betterleaks runs on 5 % of the Bash calls (p99 362 ms).
- **lint-prose.** An Edit of a prose file costs 141 ms on average. Each check starts `vale --version` through the mise shim (110 ms to 240 ms by hand) to find out if Vale works, then `check.sh` starts Vale again. The hook blocked or gave a notice on 15 % of the Edit calls.
- **The start of command.ts.** One Node start costs 33 ms to 36 ms (p50 of `enforce-cli-tools` and `format-terraform`, which do almost no work). Codex pays it for each hook on each call. With each hook through `command.ts`, the average session costs 29.5 s instead of 15.2 s.
- **type-check-tsc and type-check-pyrefly: the type check is not measured.** A Stop costs 55 ms in process and 84 ms through `command.ts`, but that is only the three git starts that decide if a check is necessary. `tsc` ran on 0 of the 1,427 Stops, because no fixture had a `tsconfig.json` at the repository root. `pyrefly` ran on 11 Stops, at 260 ms to 794 ms each, on fixtures that hold only a few files of the session.
- **The real cost of a type check.** In a real project, `tsc` or `pyrefly` checks the whole project on each Stop that follows a change to a TypeScript or Python file. That takes longer than in a fixture, and this run did not measure it. To time it, run `tsc --noEmit` or `pyrefly check` at the root of the project.
- **Stalls of 25 s.** 26 of 57,374 `command.ts` runs over both runs took 25.0 s to 26.2 s, in `format-prettier`, `block-secret-commits`, and `format-org-tables`. One was a `format-org-tables` run on a `.json` file, which only starts Node and exits, and no in-process call stalled. So the stall is in the start of the Node process, not in the code of a hook. The cause is not known, and the stalls stay in the p99 and max columns.

Possible bugs. This task did not change a hook:

- `format-prettier`, `format-org-tables`, and `format-terraform` find a commit with `command.includes("git commit")`. A command such as `git -C <dir> commit` does not match, so the amend hint does not come. `block-secret-commits` finds the same command with its `isCommit` pattern. Fixed after this run: the three hooks now use a `COMMIT` pattern that accepts global options between `git` and `commit`.
- The `ABSOLUTE` pattern of `format-prettier` matches the end of a relative path: `docs/hooks/README.md` gives `/hooks/README.md`. Each such match costs one `git rev-parse` start and finds no root. A test with a counting `Io` gives 3 git starts for a command with one absolute and two relative paths.

## Limits

- **Bash calls do not run.** A file that a Bash command wrote is in the fixture only when `bashEditDiff` names it, and a repository file that the session never read or wrote is not in the fixture. So the sweep of `format-prettier` sees fewer changed files, and `lint-code`, `format-org-tables`, and `format-terraform` find fewer files on Bash. The Bash rows can be too low.
- **Repositories.** 623 of 624 transcripts name a git branch, so almost every fixture is a git repository. It holds only the files that the transcript shows.
- **Edit text.** 557 Edit calls had no known text before the call. Their files hold only the lines of the patch hunks, so they are smaller than the real files. The slowest cases mark them "(hunks only)".
- **Mods.** The in-process path runs `core.ts` with the Node `io.ts`. A Claude Code mod runs the same core over `$`, and this run does not measure the cost of the engine.
- **lint-code config.** In the repository, the config files are `config/dot_yamllint` and `config/dot_ansible-lint`, and chezmoi renames them. The in-process pass uses a copy with the names that chezmoi gives. `command.ts` from the repository passes `config/.yamllint`, which does not exist, so `yamllint` fails and the hook reports it as a lint error. This gives the 2 calls where the two paths disagree.
- **Type checks.** A fixture holds no `tsconfig.json` and only the files of the session, not the whole project. So the Stop rows of `type-check-tsc` and `type-check-pyrefly` give the cost of the git checks, and not the cost of a type check.
- **Two runs.** The second run (2026-10-21) replaced the three formatters and the two type checks after a fix to the "Did work" probe. The transcripts grew between the runs by 8 Edit calls and 1 Stop, so their call counts differ a little from the other hooks. Another agent session was active during the first run.
