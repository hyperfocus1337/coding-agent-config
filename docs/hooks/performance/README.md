# Hook performance

This folder gives the run time of each TypeScript hook in [`dot_claude/hooks/`](../../../dot_claude/hooks/README.md) for each tool call. [`scripts/extensions/hooks/perf.ts`](../../../scripts/extensions/hooks/perf.ts) replays the tool calls of the Claude Code transcripts in `~/.claude/projects/*/*.jsonl` through each hook. The numbers are in two CSV files, see [Data](#data). This README describes them and gives the findings.

`just hooks-perf` runs the replay again, which takes hours. It writes the two CSV files and replaces the part of this README between the `perf:begin` and `perf:end` markers. The raw samples stay in `~/.cache/hook-perf/results.json` (15 MB), out of git. `just hooks-perf-render` writes the same output again from that file in seconds, for example after a change to the columns. The text outside the markers is written by hand, so check the findings against the new numbers after a run.

## Usage

Keep the rows of one agent before you rank hooks or add up times, because each hook has a row for each path, see [Data](#data).

To browse a file, use `just hooks-perf-view`. It opens [csvlens](https://github.com/YS-L/csvlens), which `mise exec` downloads on the first run (version 0.15.1), without a change to the global mise config. An agent name keeps only the rows of that agent:

```sh
just hooks-perf-view                         # summary.csv
just hooks-perf-view summary "Claude Code"   # only the rows that Claude Code runs
just hooks-perf-view slowest Codex
```

To sort in csvlens:

1. Press `Tab` once. csvlens opens in row mode, and `Tab` changes it to column mode, which highlights a column. More presses go to cell mode, then back to row mode.
2. Move to the column with `h` and `l`, or with the left and right arrow keys.
3. Press `J` (Shift+j), or Shift+↓. The first press sorts low to high. Press `J` again to sort high to low, for example for `session_ms`, `p95_ms`, or `max_ms`.

A number column sorts by value, so `1052.15` comes after `905.04`. `Ctrl+j` sorts in natural order instead, which is useful only for a text column. Other keys:

| Key  | Does                                                             |
| ---- | ---------------------------------------------------------------- |
| `&`  | Filter the rows with a regex, for example `&Claude Code`         |
| `f2` | Freeze the first two columns (`hook` and `path`) when you scroll |
| `r`  | Reset the sort, the filters, and the column widths               |
| `?`  | Show all keys                                                    |
| `q`  | Quit                                                             |

To print a sorted table, use `just hooks-perf-sort`. A number column sorts high first, a text column A to Z, and an agent name keeps only the rows of that agent:

```sh
just hooks-perf-sort                                  # summary.csv by session_ms
just hooks-perf-sort p95_ms summary "Claude Code"
just hooks-perf-sort lines slowest                    # slowest.csv by lines
```

GitHub shows each CSV file as a table with a search box, but it cannot sort the table.

## Method

- **Input and output:** the input is the real history of Claude Code sessions on this machine. The tool calls in the transcripts become the payloads of the hooks, and the files of each session are rebuilt from the transcript. The output is new: each time in the CSV files is measured in this run, on this machine.
- **Paths:** "in process" calls `core.ts` with the Node functions of `io.ts`, as `pi.ts` does. "command.ts" starts `node command.ts` with the payload on stdin, as Codex and the Claude Code command hooks do. The script does not time `guard.sh`, the `command -v node` shell wrapper, or the Bash versions of the hooks.
- **Code:** the hooks come from a `git archive` of the commit below. Uncommitted edits in the work tree do not count.
- **Events:** each hook gets the events of its `hooks/register.ts`, `pi.ts`, and `command.ts`. A hook gets every Write and Edit call, the same 2000 Bash calls (a random sample with a fixed seed), and one Stop after each turn that changed files.
- **Fixtures:** the script rebuilds each session in `~/.cache/hook-perf/fixtures/`, not under `/tmp` or `$TMPDIR`, because the formatters skip those folders. Each path in a payload or a command points into the fixture. A path under `/tmp` maps under the `TMPDIR` of the hooks, so the hooks still skip it. When the transcript names a git branch, the working folder is a git repository with the files from before the session as its first commit. The script deletes each fixture after it times the session.
- **File text:** a file gets its text from the transcript only: the content of a Write, the `originalFile` of an Edit, a full Read, and the patch hunks of an Edit or of a Bash call (`bashEditDiff`). A Bash call that commits gets a commit in the fixture. Before a Bash call, each file gets the age it had at that point in the session, because three hooks take a Bash path only when its mtime is at most 120 s old.
- **Safety:** no historical Bash command runs. A hook gets it only as payload. In process, a write outside `~/.cache/hook-perf/` is refused, and the command.ts pass skips that call.
- **Order:** the hooks run one at a time, each path after 20 warm-up calls. The `durationMs` values and the hook output in the transcripts are not used.
- **Did work and tool ran:** "did work" is measured on each path. "Tool ran" (the hook started its formatter, linter, or scanner) and "off" (the tool could not start) come from the in-process run of the same call. A call that is off is not counted.
- **Stalls:** a call slower than 2 s is a stall. The mean leaves it out, and the percentiles and the max keep it.

## Stored data

The files in git hold metadata about the sessions, and no content:

| File                     | Holds                                                                                                 |
| ------------------------ | ----------------------------------------------------------------------------------------------------- |
| `summary.csv`            | Times and counts for each hook, path, and event                                                       |
| `slowest.csv`            | For each slow call: the extension, the size, and the lines. No path, file name, command, or file text |
| The block in this README | Totals, such as the number of transcripts and tool calls                                              |

The script writes these to `~/.cache/hook-perf/`, out of git:

| Entry                 | Holds                                                                                                   |
| --------------------- | ------------------------------------------------------------------------------------------------------- |
| `results.json`        | One record for each timed call: the fields of `slowest.csv`, "did work", "tool ran", and the start time |
| `fixtures/`           | The rebuilt sessions. Empty after a run                                                                 |
| `tmp/`                | The `TMPDIR` of the hooks. It keeps what the hooks wrote there, which can be text from the sessions     |
| `src/`                | The `git archive` of the hooks for each commit                                                          |
| `lint-code-config/`   | The `lint-code` config files with the names that chezmoi gives them                                     |
| `node-compile-cache/` | The compile cache of the `command.ts` runs                                                              |

Only `results.json` is necessary for `just hooks-perf-render`. A run makes the other entries again, so you can delete them after a run.

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

## Data

| File                         | Rows                                              | Order                    |
| ---------------------------- | ------------------------------------------------- | ------------------------ |
| [`summary.csv`](summary.csv) | One row for each hook, path, and event            | `session_ms`, high first |
| [`slowest.csv`](slowest.csv) | The 5 slowest calls of each hook, over both paths | `ms`, high first         |

Columns of `summary.csv`:

| Column             | Meaning                                                                                          |
| ------------------ | ------------------------------------------------------------------------------------------------ |
| `hook`             | The hook folder in `dot_claude/hooks/`                                                           |
| `path`             | `in process` or `command.ts`, see [Method](#method)                                              |
| `agents`           | The agents that run this path of the hook, see below                                             |
| `event`            | The hook event and the tool. A Bash row of `track-session-changes` holds both phases of the call |
| `session_ms`       | `mean_ms` × `per_session`: the time the row costs in an average session                          |
| `mean_ms`          | The mean time of a call, without the stalls                                                      |
| `p95_ms`           | The percentile 95, with the stalls                                                               |
| `max_ms`           | The slowest call, with the stalls                                                                |
| `did_work_pct`     | Percent of the calls where the hook did work, see the list in [Results](#results)                |
| `calls`            | The calls that the hook got. A Bash row holds the sample of 2000                                 |
| `per_session`      | Calls of this event in an average session. A Bash row is scaled from the sample to all calls     |
| `p50_ms`, `p99_ms` | The percentiles 50 and 99, with the stalls                                                       |
| `tool_ran_pct`     | Percent of the calls where the hook started its tool                                             |

Columns of `slowest.csv`:

| Column                            | Meaning                                                                             |
| --------------------------------- | ----------------------------------------------------------------------------------- |
| `hook`, `path`, `agents`, `event` | The same as in `summary.csv`                                                        |
| `ms`                              | The time of the call                                                                |
| `extension`                       | The extension of the file, or `Bash command` for a Bash call                        |
| `hunks_only`                      | `true` when the file holds only the lines of the patch hunks, see [Limits](#limits) |
| `bytes`                           | The size of the file or the command                                                 |
| `lines`                           | The lines of the file or the command                                                |

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
- **Edit text.** 557 Edit calls had no known text before the call. Their files hold only the lines of the patch hunks, so they are smaller than the real files. `slowest.csv` marks them in the `hunks_only` column.
- **Mods.** The in-process path runs `core.ts` with the Node `io.ts`. A Claude Code mod runs the same core over `$`, and this run does not measure the cost of the engine.
- **lint-code config.** In the repository, the config files are `config/dot_yamllint` and `config/dot_ansible-lint`, and chezmoi renames them. The in-process pass uses a copy with the names that chezmoi gives. `command.ts` from the repository passes `config/.yamllint`, which does not exist, so `yamllint` fails and the hook reports it as a lint error. This gives the 2 calls where the two paths disagree.
- **Type checks.** A fixture holds no `tsconfig.json` and only the files of the session, not the whole project. So the Stop rows of `type-check-tsc` and `type-check-pyrefly` give the cost of the git checks, and not the cost of a type check.
- **Two runs.** The second run (2026-10-21) replaced the three formatters and the two type checks after a fix to the "Did work" probe. The transcripts grew between the runs by 8 Edit calls and 1 Stop, so their call counts differ a little from the other hooks. Another agent session was active during the first run.
