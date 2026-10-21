# Method of the performance test

This document tells how [`perf.ts`](../../../../scripts/extensions/hooks/perf.ts) measures the hooks, which data it keeps, and where the numbers can be wrong. The [README](../README.md) gives the usage and the findings.

## Steps

- **Input and output:** the input is the real history of Claude Code sessions on this machine. The tool calls in the transcripts become the payloads of the hooks, and the files of each session are rebuilt from the transcript. The output is new: each time in the CSV files is measured in this run, on this machine.
- **Paths:** "in process" calls `core.ts` with the Node functions of `io.ts`, as `pi.ts` does. "command.ts" starts `node command.ts` with the payload on stdin, as Codex and the Claude Code command hooks do. The script does not time `guard.sh`, the `command -v node` shell wrapper, or the Bash versions of the hooks.
- **Code:** the hooks come from a `git archive` of the commit in the [Results](../README.md#results) of the README. Uncommitted edits in the work tree do not count.
- **Events:** each hook gets the events of its `hooks/register.ts`, `pi.ts`, and `command.ts`. A hook gets every Write and Edit call, the same 2000 Bash calls (a random sample with a fixed seed), and one Stop after each turn that changed files.
- **Fixtures:** the script rebuilds each session in `~/.cache/hook-perf/fixtures/`, not under `/tmp` or `$TMPDIR`, because the formatters skip those folders. Each path in a payload or a command points into the fixture. A path under `/tmp` maps under the `TMPDIR` of the hooks, so the hooks still skip it. When the transcript names a git branch, the working folder is a git repository with the files from before the session as its first commit. The script deletes each fixture after it times the session.
- **File text:** a file gets its text from the transcript only: the content of a Write, the `originalFile` of an Edit, a full Read, and the patch hunks of an Edit or of a Bash call (`bashEditDiff`). A Bash call that commits gets a commit in the fixture. Before a Bash call, each file gets the age it had at that point in the session, because three hooks take a Bash path only when its mtime is at most 120 s old.
- **Safety:** no historical Bash command runs. A hook gets it only as payload. In process, a write outside `~/.cache/hook-perf/` is refused, and the command.ts pass skips that call.
- **Order:** the hooks run one at a time, each path after 20 warm-up calls. The `durationMs` values and the hook output in the transcripts are not used.
- **Did work and tool ran:** "did work" is measured on each path. "Tool ran" (the hook started its formatter, linter, or scanner) and "off" (the tool could not start) come from the in-process run of the same call. A call that is off is not counted.
- **Stalls:** a call slower than 2 s is a stall. The mean leaves it out, and the percentiles and the max keep it.

## Stored data

The files in git hold metadata about the sessions, and no content:

| File                            | Holds                                                                                                 |
| ------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `summary.csv`                   | Times and counts for each hook, path, and event                                                       |
| `slowest.csv`                   | For each slow call: the extension, the size, and the lines. No path, file name, command, or file text |
| The Results block of the README | Totals, such as the number of transcripts and tool calls                                              |

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

## Limits

- **Bash calls do not run.** A file that a Bash command wrote is in the fixture only when `bashEditDiff` names it, and a repository file that the session never read or wrote is not in the fixture. So the sweep of `format-prettier` sees fewer changed files, and `lint-code`, `format-org-tables`, and `format-terraform` find fewer files on Bash. The Bash rows can be too low.
- **Repositories.** 623 of 624 transcripts name a git branch, so almost every fixture is a git repository. It holds only the files that the transcript shows.
- **Edit text.** 557 Edit calls had no known text before the call. Their files hold only the lines of the patch hunks, so they are smaller than the real files. `slowest.csv` marks them in the `hunks_only` column.
- **Mods.** The in-process path runs `core.ts` with the Node `io.ts`. A Claude Code mod runs the same core over `$`, and this run does not measure the cost of the engine.
- **lint-code config.** In the repository, the config files are `config/dot_yamllint` and `config/dot_ansible-lint`, and chezmoi renames them. The in-process pass uses a copy with the names that chezmoi gives. `command.ts` from the repository passes `config/.yamllint`, which does not exist, so `yamllint` fails and the hook reports it as a lint error. This gives the 2 calls where the two paths disagree.
- **Type checks.** A fixture holds no `tsconfig.json` and only the files of the session, not the whole project. So the Stop rows of `type-check-tsc` and `type-check-pyrefly` give the cost of the git checks, and not the cost of a type check.
- **Two runs.** The second run (2026-10-21) replaced the three formatters and the two type checks after a fix to the "Did work" probe. The transcripts grew between the runs by 8 Edit calls and 1 Stop, so their call counts differ a little from the other hooks. Another agent session was active during the first run.
