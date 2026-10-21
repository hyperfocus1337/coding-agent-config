# Hook performance

This folder gives the run time of each TypeScript hook in [`dot_claude/hooks/`](../../../dot_claude/hooks/README.md) for each tool call. [`scripts/extensions/hooks/perf.ts`](../../../scripts/extensions/hooks/perf.ts) replays the tool calls of the Claude Code transcripts in `~/.claude/projects/*/*.jsonl` through each hook. The numbers are in two CSV files, see [Data](#data). This README tells how to read them and what they show. [`docs/method.md`](docs/method.md) tells how the test made them.

## Usage

### Keep the rows of one agent

Each hook has a row for each path, and an agent runs only one path, see [Agents](#agents). Keep the rows of one agent before you rank hooks or add up times. csvlens and `just hooks-perf-view` take a regex for this:

| Regex             | Keeps                                         |
| ----------------- | --------------------------------------------- |
| `Claude Code`     | The rows that Claude Code runs                |
| `Codex`           | The rows that Codex runs                      |
| `Claude\|pi, omp` | All rows except the rows that only Codex runs |

The regex matches a part of any cell, and it cannot exclude a value. So to drop Codex, keep the other agents. `just hooks-perf-sort` takes one agent name, not a regex.

### Browse with csvlens

`just hooks-perf-view` opens a file in [csvlens](https://github.com/YS-L/csvlens), which `mise exec` downloads on the first run (version 0.15.1), without a change to the global mise config. The second argument is a row filter:

```sh
just hooks-perf-view                         # summary.csv
just hooks-perf-view summary "Claude Code"   # only the rows that Claude Code runs
just hooks-perf-view slowest Codex
```

To sort:

1. Press `Tab` once. csvlens opens in row mode, and `Tab` changes it to column mode, which highlights a column. More presses go to cell mode, then back to row mode.
2. Move to the column with `h` and `l`, or with the left and right arrow keys.
3. Press `J` (Shift+j), or Shift+↓. The first press sorts low to high. Press `J` again to sort high to low, for example for `session_ms`, `p95_ms`, or `max_ms`.

A number column sorts by value, so `1052.15` comes after `905.04`. `Ctrl+j` sorts in natural order instead, which is useful only for a text column.

To filter, type `&` for rows or `*` for columns, then a regex, then press `Enter`. `&` matches any cell, and `*` matches the column name only:

| Input                            | Keeps                                    |
| -------------------------------- | ---------------------------------------- |
| `&Claude Code`                   | The rows that Claude Code runs           |
| `*hook\|_ms`                     | `hook` and the six time columns          |
| `*hook\|agents\|session_ms\|p95` | `hook`, `agents`, `session_ms`, `p95_ms` |

Other keys:

| Key  | Does                                                             |
| ---- | ---------------------------------------------------------------- |
| `f2` | Freeze the first two columns (`hook` and `path`) when you scroll |
| `r`  | Reset the sort, the filters, and the column widths               |
| `?`  | Show all keys                                                    |
| `q`  | Quit                                                             |

GitHub shows each CSV file as a table with a search box, but it cannot sort the table.

### Print a sorted table

`just hooks-perf-sort` prints a file as a table. A number column sorts high first, and a text column A to Z. The third argument is a row filter on `agents`:

```sh
just hooks-perf-sort                                  # summary.csv by session_ms
just hooks-perf-sort p95_ms summary "Claude Code"
just hooks-perf-sort lines slowest                    # slowest.csv by lines
```

### Run the test again

`just hooks-perf` runs the replay again, which takes hours. It writes the two CSV files and replaces the part of this README between the `perf:begin` and `perf:end` markers, see [Results](#results). The raw samples stay in `~/.cache/hook-perf/results.json` (15 MB), out of git. `just hooks-perf-render` writes the same output again from that file in seconds, for example after a change to the columns. The text outside the markers is written by hand, so check the findings against the new numbers after a run.

## Data

### Files

| File                              | Rows                                              | Order                    |
| --------------------------------- | ------------------------------------------------- | ------------------------ |
| [`summary.csv`](data/summary.csv) | One row for each hook, path, and event            | `session_ms`, high first |
| [`slowest.csv`](data/slowest.csv) | The 5 slowest calls of each hook, over both paths | `ms`, high first         |

More documents:

| Document                             | Gives                                                                                  |
| ------------------------------------ | -------------------------------------------------------------------------------------- |
| [`docs/columns.md`](docs/columns.md) | A one-line meaning for each column, then each column with examples from the rows       |
| [`docs/method.md`](docs/method.md)   | How the test measures the hooks, the data it keeps, and where the numbers can be wrong |

### Agents

An agent runs only one path of a hook, so a ranking or a sum must keep only the rows of one agent. If it does not, it counts each hook twice, and the `command.ts` rows of a hook that Claude Code runs in process come out on top. The script reads `agents` from the files that load the hooks when it writes the CSV files:

| Agent       | Path       | Loaded by                                                                       |
| ----------- | ---------- | ------------------------------------------------------------------------------- |
| Claude Code | in process | `CLAUDE_CODE_PLUGIN_DIRS` in `dot_claude/settings.json.tmpl`                    |
| Claude Code | command.ts | The command hooks in `dot_claude/settings.json.tmpl`, also through `guard.sh`   |
| pi          | in process | `extensions` in `dot_pi/agent/modify_settings.json`                             |
| omp         | in process | `extensions` in `dot_omp/private_agent/private_config.yml`, `pi.ts` or `omp.ts` |
| Codex       | command.ts | `dot_codex/modify_hooks.json`                                                   |

## Findings

An average session in these transcripts has 49.2 Bash calls, 4.7 Edit calls, 0.9 Write calls, and 2.3 Stops. The sum of `session_ms` over the rows whose `agents` holds Claude Code is 15.2 s for each session, or about 0.27 s for each tool call. These hooks cost the most time:

| Hook                    | Path in Claude Code | Time per session | Main cost                       |
| ----------------------- | ------------------- | ---------------: | ------------------------------- |
| `format-prettier`       | in process          |            5.7 s | The Bash sweep, 114 ms per call |
| `format-org-tables`     | in process          |            2.9 s | One Emacs start, about 700 ms   |
| `track-session-changes` | in process          |            2.8 s | Two git snapshots per Bash call |
| `block-secret-commits`  | command.ts          |            2.5 s | One Node start per Bash call    |
| `lint-prose`            | in process          |            0.8 s | Two Vale starts per prose file  |

Each other hook takes 0.2 s or less for each session. For `type-check-tsc` and `type-check-pyrefly`, this number holds almost no type check, so do not rank them as cheap (see below).

- **format-prettier on Bash.** Each Bash call costs 114 ms (mean, in process), but Prettier runs on only 8 % of them. The sweep starts `git rev-parse` for the cwd and for each absolute path in the command, then `git diff` and `git ls-files` in each repository it finds. In this run, the `ABSOLUTE` pattern in `core.ts` also matched the end of a relative path, such as `/hooks/README.md` in `docs/hooks/README.md`, and each such match cost one more `git rev-parse` start. This is fixed after the run. A Write or Edit costs almost nothing when the extension does not match, and about 110 ms (p95) when Prettier runs.
- **format-org-tables.** An Emacs batch run takes 680 ms to 770 ms (p95), most of it the start of Emacs. In these transcripts, Emacs runs on 22 % of the Edit calls and 19 % of the Write calls, because many sessions edit Org files with tables. The hook reads the file first and starts Emacs only for a file with a table line, so a file without a table costs less than 0.1 ms.
- **track-session-changes.** Each Bash call takes a snapshot before and after: `git add -A` into a copy of the session index, then a diff. That costs 53 ms in process and 149 ms through `command.ts`, which starts Node twice. Each Edit costs 25 ms and each Write 37 ms, for `git hash-object`.
- **block-secret-commits.** The core takes 0.01 ms for a command that does not commit. In Claude Code it is a command hook, so each Bash call pays one Node start of about 34 ms, plus `guard.sh`, which this run does not time. Betterleaks runs on 5 % of the Bash calls (p99 362 ms).
- **lint-prose.** An Edit of a prose file costs 141 ms on average. Each check starts `vale --version` through the mise shim (110 ms to 240 ms by hand) to find out if Vale works, then `check.sh` starts Vale again. The hook blocked or gave a notice on 15 % of the Edit calls.
- **The start of command.ts.** One Node start costs 33 ms to 36 ms (p50 of `enforce-cli-tools` and `format-terraform`, which do almost no work). Codex pays it for each hook on each call. With each hook through `command.ts`, the average session costs 29.5 s instead of 15.2 s.
- **type-check-tsc and type-check-pyrefly: the type check is not measured.** A Stop costs 55 ms in process and 84 ms through `command.ts`, but that is only the three git starts that decide if a check is necessary. `tsc` ran on 0 of the 1,427 Stops, because no fixture had a `tsconfig.json` at the repository root. `pyrefly` ran on 11 Stops, at 260 ms to 794 ms each, on fixtures that hold only a few files of the session.
- **The real cost of a type check.** In a real project, `tsc` or `pyrefly` checks the whole project on each Stop that follows a change to a TypeScript or Python file. That takes longer than in a fixture, and this run did not measure it. To time it, run `tsc --noEmit` or `pyrefly check` at the root of the project.
- **Stalls of 25 s.** 26 of 57,374 `command.ts` runs over both runs took 25.0 s to 26.2 s, in `format-prettier`, `block-secret-commits`, and `format-org-tables`. One was a `format-org-tables` run on a `.json` file, which only starts Node and exits, and no in-process call stalled. So the stall is in the start of the Node process, not in the code of a hook. The cause is not known, and the stalls stay in the p99 and max columns.

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

<!-- perf:end -->
