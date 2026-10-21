# Columns of the performance data

This document explains each column of [`summary.csv`](../data/summary.csv) and [`slowest.csv`](../data/slowest.csv), with examples from the rows. The quick reference gives a one-line meaning for each column. The sections after it explain what a number tells you, and which column answers your question.

## Quick reference

### `summary.csv`

| Column             | Meaning                                                                                             |
| ------------------ | --------------------------------------------------------------------------------------------------- |
| `hook`             | The hook folder in `dot_claude/hooks/`                                                              |
| `path`             | `in process` or `command.ts`, see [`path`](#path)                                                   |
| `agents`           | The agents that run this path of the hook, see [`agents`](#agents)                                  |
| `event`            | The hook event and the tool. A Bash row of `track-session-changes` holds both phases of the call    |
| `session_ms`       | `mean_ms` × `per_session`: the time the row costs in an average session                             |
| `mean_ms`          | The mean time of a call, without the stalls                                                         |
| `p95_ms`           | The percentile 95, with the stalls                                                                  |
| `max_ms`           | The slowest call, with the stalls                                                                   |
| `did_work_pct`     | Percent of the calls where the hook did work, see the list in [`data/README.md`](../data/README.md) |
| `calls`            | The calls that the hook got. A Bash row holds the sample of 2000                                    |
| `per_session`      | Calls of this event in an average session. A Bash row is scaled from the sample to all calls        |
| `p50_ms`, `p99_ms` | The percentiles 50 and 99, with the stalls                                                          |
| `tool_ran_pct`     | Percent of the calls where the hook started its tool                                                |

### `slowest.csv`

| Column                            | Meaning                                                                                          |
| --------------------------------- | ------------------------------------------------------------------------------------------------ |
| `hook`, `path`, `agents`, `event` | The same as in `summary.csv`                                                                     |
| `ms`                              | The time of the call                                                                             |
| `extension`                       | The extension of the file, or `Bash command` for a Bash call                                     |
| `hunks_only`                      | `true` when the file holds only the lines of the patch hunks, see the [Limits](method.md#limits) |
| `bytes`                           | The size of the file or the command                                                              |
| `lines`                           | The lines of the file or the command                                                             |

## What a row is

A hook is a small program that an agent starts on an event, for example after each Edit call. Each hook call adds time to the turn, because the agent waits for the hook before it continues. The performance test replays the tool calls of real sessions through each hook and measures the time of each call. One row of `summary.csv` collects all calls of one hook, on one path, for one event.

All times are in milliseconds (ms): 1000 ms is 1 second. A time is wall-clock time, from the start of the hook call to its end. It includes the time of each program that the hook starts, for example Prettier, Emacs, Vale, or git.

## Which column answers which question

| Question                                               | Column                               |
| ------------------------------------------------------ | ------------------------------------ |
| Which hook costs the most time in a session?           | `session_ms`                         |
| How long does a typical call take?                     | `p50_ms`                             |
| How long does a slow call take, one that you notice?   | `p95_ms`, `p99_ms`                   |
| What is the worst case?                                | `max_ms`                             |
| How often does the hook change a file or block a call? | `did_work_pct`                       |
| How often does the hook start its expensive tool?      | `tool_ran_pct`                       |
| Does the size of a file make the hook slow?            | `bytes` and `lines` in `slowest.csv` |

Before you rank or add up rows, keep the rows of one agent with the `agents` column. Each hook has a row for each path, and an agent runs only one of them, see [`agents`](#agents).

## Identity columns

### `hook`

The name of the hook folder in [`dot_claude/hooks/`](../../../../dot_claude/hooks/README.md), for example `format-prettier`.

### `path`

The way the hook runs. A hook has one core, `core.ts`, and the agents start it in two ways:

| Path         | How it runs                                                                  | Start cost                     |
| ------------ | ---------------------------------------------------------------------------- | ------------------------------ |
| `in process` | The agent loads the hook once, and each call is a function call in the agent | Almost 0 ms                    |
| `command.ts` | The agent starts a new Node process for each call, with the payload on stdin | About 34 ms for the Node start |

So the same hook has two rows, and the `command.ts` row is about 34 ms slower for each call, also when the hook does nothing. For example, `enforce-cli-tools` takes 0.04 ms in process and 34.87 ms through `command.ts`. The difference is the Node start, not the hook.

### `agents`

The agents that run this path of the hook: Claude Code, pi, omp, or Codex. The script finds them in the files that load the hooks, see the [README](../README.md#agents). In this repository, Claude Code runs most hooks in process, and Codex runs each hook that has a `command.ts` through it.

This column is important for a ranking. If you sort all rows by `session_ms`, the top two rows are `command.ts` rows of `track-session-changes` and `format-prettier`, at 7.3 s and 7.0 s for each session. Only Codex runs those rows. In Claude Code, the same two hooks run in process and cost 2.6 s and 5.6 s on Bash calls. So keep the rows of the agent that you want to know about, for example with `just hooks-perf-view summary "Claude Code"`.

### `event`

The hook event and the tool of the call:

| Event                           | When it fires                                                    |
| ------------------------------- | ---------------------------------------------------------------- |
| `PreToolUse <tool>`             | Before the tool runs. The hook can block the call                |
| `PostToolUse <tool>`            | After the tool ran. The hook can format, lint, or log the result |
| `PreToolUse + PostToolUse Bash` | Both. The row adds up the two phases of one call                 |
| `Stop`                          | When the agent ends a turn that changed files                    |
| `SessionStart`                  | Once, when a session starts                                      |

The tool is `Bash`, `Edit`, `Write`, or `NotebookEdit`. A hook can have rows for several tools, because each tool has a different cost. For example, `format-prettier` on Bash must search the repository for changed files, but on Edit it knows the file.

## Time columns

### `mean_ms`

The average time of a call: the sum of the times divided by the number of calls. The mean leaves out stalls, calls slower than 2 seconds, see [`max_ms`](#max_ms). This column is the base of `session_ms`.

### `p50_ms`, `p95_ms`, and `p99_ms`

A percentile is the time that a given percent of the calls do not exceed. If `p95_ms` is 710, then 95 of 100 calls took 710 ms or less, and 5 of 100 calls took longer. `p50_ms` is the median: half of the calls are faster, and half are slower. The percentiles keep the stalls.

The mean and the median can be very different, and the difference tells you how the hook works. Look at `format-org-tables` in process on Edit:

| `p50_ms` | `mean_ms` | `p95_ms` | `tool_ran_pct` |
| -------: | --------: | -------: | -------------: |
|     0.02 |    157.83 |   710.09 |             22 |

Most Edit calls are not on an Org file with a table, so the hook returns in 0.02 ms. On 22 % of the calls, the hook starts Emacs, which takes about 700 ms. The median shows the fast case, `p95_ms` shows the slow case, and the mean is between them. So a low `p50_ms` does not make a hook cheap: look at `p95_ms` and `session_ms` too.

### `max_ms`

The slowest call of the row. It shows one call only, so it can be an accident of the machine and not a property of the hook. For example, `block-secret-commits` through `command.ts` has a `max_ms` of 25469.61, but its `p99_ms` is 362.18. Over the two runs of the test, 26 of 57,374 `command.ts` calls took about 25 seconds, in the start of the Node process and not in the hook code. The [method](method.md#steps) calls these calls stalls, and the mean leaves them out.

## Frequency columns

### `calls`

The number of calls that the row measured. Write, Edit, Stop, and SessionStart rows hold all calls of the transcripts, except the calls that [`data/README.md`](../data/README.md) lists as left out. A Bash row holds a sample of 2000 of the 30,646 Bash calls, because a replay of all Bash calls would take too long. The sample is random, with a fixed seed, so each run uses the same 2000 calls.

A row with few calls gives a weak number. For example, `track-session-changes` on NotebookEdit has 1 call, so its time can be an accident.

### `per_session`

The number of calls of this event in an average session: the calls in all transcripts divided by the 623 transcripts. A Bash row is scaled from the sample to all Bash calls. For example, a Bash row has `per_session` 49.19, because 30,646 Bash calls in 623 sessions give 49.19 Bash calls for each session.

This column shows why the Bash rows are often the most expensive rows. A session has about 49 Bash calls, against 4.7 Edit calls and 0.9 Write calls. So a hook that adds 10 ms to each Bash call costs more than a hook that adds 50 ms to each Edit call.

## Cost column

### `session_ms`

The time that this row adds to an average session: `mean_ms` × `per_session`. It joins the two questions "how slow is a call" and "how often does the call happen" into one number. Use it to rank hooks by their total cost.

For example, `format-prettier` in process on Bash has `mean_ms` 113.95 and `per_session` 49.19. So it adds 113.95 × 49.19 = 5605 ms, or 5.6 seconds, to an average session. To get the cost of a hook for one agent, add up `session_ms` over the rows of that hook and agent. The sum of all Claude Code rows is 15.2 seconds for each session.

`session_ms` is an average, not the time of one session. A session with many Bash calls costs more, and a session with no Org files pays nothing for `format-org-tables`. For `type-check-tsc` and `type-check-pyrefly`, the number holds almost no type check, because the test fixtures have no full project, see the [Limits](method.md#limits).

## Activity columns

### `did_work_pct`

The percent of the calls where the hook did something that matters to you. The meaning depends on the hook:

| Hook type                | "Did work" means                    |
| ------------------------ | ----------------------------------- |
| Formatter                | The hook changed a file             |
| Linter or type check     | The hook reported errors or blocked |
| Guard, such as `block-*` | The hook blocked the call           |
| `track-session-changes`  | The hook logged a changed file      |

[`data/README.md`](../data/README.md) lists the meaning for each hook. A low `did_work_pct` is not bad for a guard: `block-secret-commits` blocks 0 % of these calls, because no session tried to commit a secret. For a formatter, a low `did_work_pct` with a high `session_ms` can show that the hook does much work to find nothing.

### `tool_ran_pct`

The percent of the calls where the hook started its tool, for example Prettier, Emacs, Vale, or Betterleaks. The tool is usually the expensive part of a call, but some hooks also start git on each call to decide if the tool must run.

Compare `tool_ran_pct` with `did_work_pct` to see how much of the tool time gives a result:

| Row                                       | `tool_ran_pct` | `did_work_pct` | Meaning                                                |
| ----------------------------------------- | -------------: | -------------: | ------------------------------------------------------ |
| `lint-prose`, in process, Edit            |             50 |             15 | Vale checks half of the edits and finds alerts in 15 % |
| `format-prettier`, in process, Bash       |              8 |              3 | Prettier runs on 8 % of the Bash calls and changes 3 % |
| `track-session-changes`, in process, Edit |            100 |            100 | Each call runs git and logs the file                   |

`tool_ran_pct` does not show all the cost. `format-prettier` on Bash starts Prettier on only 8 % of the calls, but its mean is 113.95 ms, because it starts git on each call to find the changed files.

## Columns of `slowest.csv`

`slowest.csv` holds the 5 slowest calls of each hook, over both paths. Use it to find out why a call was slow. `hook`, `path`, `agents`, and `event` have the same meaning as in `summary.csv`.

| Column       | Meaning                                                                                                                                                              |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ms`         | The time of this one call                                                                                                                                            |
| `extension`  | The extension of the file of the call, such as `.org` or `.ts`. A Bash call shows `Bash command`                                                                     |
| `hunks_only` | `true` when the test did not know the full file text and rebuilt only the changed lines. The file is then smaller than the real file, so the real call can be slower |
| `bytes`      | The size of the file, or of the command text for a Bash call                                                                                                         |
| `lines`      | The number of lines of the file or of the command                                                                                                                    |

If the slow calls have large files, the size drives the time. If they have small files, look for a fixed cost, such as a program start. For example, the slowest `format-org-tables` call took 25,133 ms on a 6.6 KB `.json` file. The hook does not format JSON, so it only started Node: this call is a stall, not a cost of the file.
