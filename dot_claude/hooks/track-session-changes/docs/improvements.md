# Improvements

Changes that are not decided yet. Each section gives the problem, the proposed fix, and the open questions. [implementation.md](implementation.md) gives how the code works now.

## Keep the changes of a session across `/clear`

### Problem

`/clear` in Claude Code, and `/new` in Pi, start a new session id in the same process and the same terminal. The hook writes one log for each session id, so the changes before the clear stay in the log of the old session. The new session starts with an empty log.

The overview of the `agent-changed-files` Emacs package then shows only the changes after the clear. The cmux title of the terminal goes to the new session, and the old session is not live. With `agent-changed-files-inactive` at `hide` and `agent-changed-files-active` at `both`, the overview hides the old session. Its files show only in the header count "N files of hidden sessions".

Example from 2026-11-01, in the cmux terminal "Apply flymake-vale-extras tab":

| Session id | Time                                           | Files it changed in `flymake-vale-extras`                                                                                            |
| ---------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `a1b817ed` | 2026-10-31 12:15 to 2026-11-01 19:02:17        | `flymake-vale-extras.el`, `test/flymake-vale-extras-test.el`, `docs/implementation.org`, `README.org`, `flymake-vale-extras-menu.el` |
| `f9653522` | from 2026-11-01 19:02:17, first entry `/clear` | `README.org`, `flymake-vale-extras-menu.el`                                                                                          |

The overview showed 2 files for the terminal, and "3 files of hidden sessions".

Claude Code records no link from the new session to the old one: the new transcript and the cmux session entry do not name the old session id.

### Workaround

In the session picker, `C-c C-a` until active is `outstanding`, or `C-c C-i` until inactive is `grey`. The old session then shows as a separate row with its log title. Other ended sessions with uncommitted files also show again.

`/compact` keeps the session id, so it does not cause the problem.

### Proposed fix

At a clear, the hook copies the old session into the new one. The `agent-changed-files` package needs no change, because it reads one log for each session.

1. A shared function in `core.ts` appends the lines of the old log to the new log. A log line holds no session id, so the lines need no change.
2. The same function writes the `objects/` folder of the old session into `objects/info/alternates` of the new session, so git finds the before and after blobs of the old lines.
3. Each adapter calls the function only when the agent gives the old session id at the start of a new session in the same process:

| Agent       | Adapter             | Source of the old session id                                                                                        | Status                                                              |
| ----------- | ------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Pi          | `pi.ts`             | `session_start` with `reason: "new"` and `previousSessionFile`, since Pi 0.65.0                                     | Documented                                                          |
| Claude Code | `hooks/register.ts` | The mod runs in the Claude Code process, so it can keep the last session id in a variable                           | Not checked: the `session.start` event must give the source `clear` |
| omp         | `omp.ts`            | omp comes from Pi, so probably the same `session_start` fields                                                      | Not checked                                                         |
| Codex       | `command.ts`        | A new process for each event keeps no variable; only possible if `SessionStart` gives a clear source and the old id | Not checked, can be impossible                                      |

Size: about 20 to 30 lines in `core.ts`, 3 to 10 lines in each adapter, and one test in `test/check.ts`.

### Open questions

- **Resume and fork:** the copy must not run at `/resume`, where the old session is a different task, or at a Pi `fork`, where the cmux code of the package already follows the new session.
- **Old session:** its log stays, so `claude --resume` of it still works. With `agent-changed-files-inactive` at `off`, the overview then shows its files twice: in the old row and in the new row.
- **Prune:** the alternates file points to the `objects/` of the old session. The prune deletes that folder 30 days after the last use of the old session, while the new session can still use it.
- **Other options:** a link line in the new log that the package follows is exact too, but it adds a merge to the scan, the overview and the step commands of the package. A match by time, a transcript that starts with `/clear` about 60 ms after another transcript ends, needs no hook change, but it can link the wrong sessions when two sessions in one folder clear at about the same time.
