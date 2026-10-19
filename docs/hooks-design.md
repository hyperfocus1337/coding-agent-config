# Hooks as mods: design

This document says how each hook in [`dot_claude/hooks/`](../dot_claude/hooks/README.md) moves to one TypeScript core that Claude Code, pi, omp, and Codex share. [`hooks-feasibility.md`](hooks-feasibility.md) holds the facts, the spikes, and the agreed plan that this design uses. This document holds the rules for each hook folder, the design of each hook that has not moved, the cutover steps, and the decisions.

Written on 2026-10-18, with Claude Code 2.1.302, pi 1.1.0, omp 18.10.3, Codex 0.162.1, and Node 26.11.1.

## Status

| Hook                       | State                                                              |
| -------------------------- | ------------------------------------------------------------------ |
| `enforce-cli-tools`        | Moved. Live in Claude Code, pi, and omp. Codex runs `command.ts`.  |
| `lint-all-languages`       | Moved. Live in Claude Code, pi, and omp. Codex runs `command.ts`.  |
| `block-commit-attribution` | Moved. Live in Claude Code, pi, and omp. Not wired in Codex.       |
| `block-secret-commits`     | Moved. Claude Code and Codex run `command.ts`. Live in pi and omp. |
| `format-all-languages`     | Moved. Live in Claude Code, pi, and omp. Codex runs `command.ts`.  |
| `format-org-tables`        | Moved. Live in Claude Code, pi, and omp. Codex runs `command.ts`.  |
| `format-staged-files`      | Moved to `dot_config/git/hooks/`. Runs for each agent.             |
| `lint-prose`               | Moved. Live in Claude Code, pi, and omp. Codex runs `command.ts`.  |
| `type-check-all-languages` | Moved. Claude Code and Codex run `command.ts`. Live in pi and omp. |
| `track-session-changes`    | Moved. Live in Claude Code, pi, and omp. Codex runs `command.ts`.  |

## Rules for a hook folder

### Files

Each hook is one folder in `dot_claude/hooks/<hook>/` and imports nothing from outside it (Q11). chezmoi deploys it to `~/.claude/hooks/<hook>/`.

| File                            | Role                                                                                                                  | Deployed                             |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| `core.ts`                       | The logic. No Node imports, no `$`, no environment reads.                                                             | Yes                                  |
| `io.ts`                         | The Node side of the core inputs: file reads, `spawn`, `process.env`. For `pi.ts` and `command.ts`.                   | Yes                                  |
| `hooks/register.ts`             | The Claude Code mod                                                                                                   | Yes                                  |
| `hooks/hooks.json`              | `{"modules": ["./register.ts"]}`                                                                                      | Yes                                  |
| `dot_claude-plugin/plugin.json` | The plugin manifest: `name`, `version`, `description`                                                                 | Yes, as `.claude-plugin/plugin.json` |
| `pi.ts`                         | The pi and omp extension                                                                                              | Yes                                  |
| `command.ts`                    | The command hook: stdin JSON in, exit code 2 and stderr out. For Codex, and for Claude Code where a mod does not fit. | Yes                                  |
| Data files                      | `rules`, `config/`, `conf/`: read at run time, never imported                                                         | Yes                                  |
| `README.md`, `docs/`, `test/`   | Kept in the repo by `.chezmoiignore`                                                                                  | No                                   |

A hook that has no Claude Code mod, such as `block-secret-commits`, has no `hooks/` folder and no `dot_claude-plugin/`.

### The core

The core takes values or an `Io` object, never `$`, and never reads an environment variable (change 2 in the feasibility doc).

- **A pure core** matches text and returns a result. `enforce-cli-tools` and `block-commit-attribution` are pure.
- **An `Io` core** must run a program or read a file before it can decide. It gets an `Io` object with only the functions it needs, for example `stat`, `read`, and `run`. `lint-all-languages/core.ts` is the model.
- **Each `Io` function returns `undefined` for "missing"** (a file that does not exist, a program that is not installed) instead of throwing. The core then applies the "self-disable when a tool is missing" convention in one place.
- **All `Io` functions are async,** because the mod has no synchronous I/O. The Node side wraps `node:fs/promises` and `spawn`.

### The adapters

| Adapter             | Reads the environment with     | Project root                                     | Blocks with               | Feedback after a call                        |
| ------------------- | ------------------------------ | ------------------------------------------------ | ------------------------- | -------------------------------------------- |
| `hooks/register.ts` | `$.env.get("NAME")`, a literal | `$.session.root()`                               | `{ deny }` before `next`  | `{ ...ran, context: [...] }` after `next`    |
| `pi.ts`             | `process.env` through `io.ts`  | `ctx.cwd`                                        | `{ block: true, reason }` | `tool_result` returns `{ content, isError }` |
| `command.ts`        | `process.env` through `io.ts`  | `CLAUDE_PROJECT_DIR \|\| payload.cwd \|\| cwd()` | exit 2, message on stderr | exit 2, output on stderr                     |

- **The `$` call-site rule.** In `register.ts`, spell each `$` call where it is used. To give the core an `Io`, write an object literal whose methods spell `$.fs.stat(...)` and `$.process.run(...)` inside them. `claude plugin validate` refuses `$.fs` passed as a value.
- **Timeouts.** `$.process.run` stops a program after 30 s. Pass `timeoutMs` where today's settings entry gives more.
- **`classic.*` events.** For a Team organization, the built-in `cc-plugin-sec-default` skips each user mod on a `classic.*` event, so such a mod never runs. Use a command hook in `settings.json` for those events. Found in the `type-check-all-languages` cutover.
- **The `context` field reaches the model after a Write, an Edit, and a Bash call.** Tested live on 2026-10-18. A `claude -p` stream records it only where the model quotes it.

### Failure behavior

Keep each hook's current choice (Q5). The adapters differ in what a thrown error does:

| Adapter      | An error that escapes the hook                | To fail open         | To fail closed                         |
| ------------ | --------------------------------------------- | -------------------- | -------------------------------------- |
| Mod          | Claude Code skips the hook, and the call runs | Nothing to do        | Add a `.catch` that returns `{ deny }` |
| `pi.ts`      | pi blocks the call                            | Catch in the handler | Nothing to do                          |
| `command.ts` | Node exits 1, which does not block            | Nothing to do        | Catch, then exit 2                     |

### Wiring

| Agent                     | Where                                      | Change for a moved hook                                                                                              |
| ------------------------- | ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| Claude Code, mod          | `dot_claude/settings.json.tmpl`            | Add the hook name to the `list` in `CLAUDE_CODE_PLUGIN_DIRS`. Remove the hook's command entries.                     |
| Claude Code, command hook | `dot_claude/settings.json.tmpl`            | Point the entry at `node "$HOME/.claude/hooks/<hook>/command.ts"`                                                    |
| pi                        | `dot_pi/agent/modify_settings.json`        | Add `~/.claude/hooks/<hook>/pi.ts` to `extensions`                                                                   |
| omp                       | `dot_omp/private_agent/private_config.yml` | Add the same path to `extensions`                                                                                    |
| Codex                     | `dot_codex/modify_hooks.json`              | `command -v node >/dev/null \|\| exit 0; NODE_COMPILE_CACHE="$HOME/.cache/node-compile-cache" node ".../command.ts"` |

Each Codex entry that changes needs new trust in the Codex TUI, on the host and in the devcontainer.

A Codex entry, and a Claude Code command entry, exits 0 when `node` is missing, so the hook does not run. A `SessionStart` entry in each of the two agents warns once for each session (decision D5). When a hook moves, add its name to the list of hooks in the warning of each agent that runs it as a command.

## Measured: the time of a mod hook

The feasibility doc left this open. A copy of the `enforce-cli-tools` mod timed its own work with `performance.now()` in 6 Bash calls of a `claude -p` session, on 2026-10-18:

| Part                                                  | Time                               |
| ----------------------------------------------------- | ---------------------------------- |
| 4 `$` calls: `session.root`, 2 × `fs.read`, `env.get` | 1.7 to 15.2 ms, median 3.1 ms      |
| The matcher in `core.ts`                              | 0.03 ms, 0.28 ms on the first call |

The two calls over 12 ms were probably the first calls of the session. A `$` call costs about 1 ms, so a hook that makes many calls, such as `track-session-changes`, must be measured, see its spike.

## Design for each hook

### lint-all-languages

The code is done. The cutover adds the wiring and replaces `dot_codex/hooks/apply-patch.sh`, which runs `bash "$hook"` and so cannot run a `.ts` file.

`dot_codex/hooks/apply-patch.ts <command.ts>` (Q22):

1. Reads the Codex `apply_patch` payload on stdin.
2. Takes the paths from the `*** Add File:`, `*** Update File:`, and `*** Move to:` lines, without duplicates, and skips a path that does not exist.
3. For each path, runs `node <command.ts>` with a payload that has `tool_name: "Write"` and `tool_input.file_path`.
4. Exits 2 if a run exits 2, else with the highest exit code. It passes stderr through.

Each path costs one Node start, about 18 ms. A patch changes 1 to 3 files in most cases. The formatters and `lint-prose` use the same script after their cutover.

### block-commit-attribution

Same shape as `enforce-cli-tools`: a pure core, a mod that denies before `next`, and a `pi.ts`. It stays unwired in Codex (feasibility, decisions for each hook).

- **Core:** `violation(command)` returns the message when `commit` is a whole word and the command holds `co-authored-by:\s*claude`, case-insensitive.
- **Dropped, as approved for `enforce-cli-tools`:** the Cursor JSON, the substring pre-filter, and `jq`.
- **Known gap, unchanged:** `git commit -F <file>` passes, because the message is not in the command.

### block-secret-commits

Stays a command hook in Claude Code (Q20), so it has `command.ts` and `pi.ts`, but no mod.

- **Why not a mod:** the binary scan copies each new binary file to a temporary folder. `$.fs` has no copy, no remove, and no binary write, and it rejects a file over 4 MiB. Node has all of these.
- **Fails closed for binaries, open for content (Q5).** In `command.ts`, the binary step catches its own errors and exits 2. The content step catches its own errors and exits 0. In `pi.ts`, the content step must catch, because pi blocks on a throw.
- **Time cap:** each betterleaks run gets its own 4 s cap through the `timeout` option of `spawn`, which kills the child. A capped scan writes "capped" on stderr and allows, as today.
- **Allow prints nothing:** today the hook prints the Cursor JSON `{"permission":"allow"}` on stdout. Codex reports this output as a failed hook and lets the call run (tested on 2026-10-19). `command.ts` exits 0 with no output.
- **Inputs, unchanged:** `.claude-allow-secrets`, `CLAUDE_ALLOW_SECRETS`, `conf/betterleaks.toml`, and `.betterleaksignore`.
- **Tests:** port the 40 assertions of `test.sh` and `test-content.sh` to `test/check.ts`. They build real repositories and need betterleaks.

### format-all-languages and format-org-tables

Both formatters are advisory and always fail open. Each gets a mod that runs after `next`, a `pi.ts` on `tool_result`, and a `command.ts` for Codex and for `format-staged-files`.

- **Core:** finds the files in the same way as today:
  - the `file_path` of a Write or an Edit;
  - for a Bash call, the paths that the command names. `format-all-languages` also adds the Markdown files that git reports as changed in each repository the command touches. `format-org-tables` only takes `.org` files changed in the last 120 s.
- **Run:** `prettier --write --prose-wrap preserve --ignore-path .prettierignore <files>` in one run, and one `emacs --batch` run for all `.org` files. Pass `ORG_TABLE_FILES` through the `env` option of `$.process.run`.
- **Changed-file check:** replace `cksum` with a compare of the text from `read` before and after the run.
- **Amend hint:** today `hookSpecificOutput.additionalContext`. In the mod, it is `context`. In pi, it is appended to the result `content`.
- **Timeouts:** pass `timeoutMs` of 20 s and 10 s, the current values.
- **pi field names:** an edit result uses `path`, and omp uses `paths`. The adapter reads both.

### format-staged-files

This is a git `pre-commit` hook, not an agent hook. It moves to `dot_config/git/hooks/format-staged-files/` as a Node CLI (Q23).

- **Agent detection (Q25):** runs when any of these is set: `CLAUDECODE=1`, `PI_CODING_AGENT=true`, `OMPCODE=1`, or `CODEX_THREAD_ID`. Today only `CLAUDECODE=1` counts, so pi and Codex commits are not formatted.
- **Flow, unchanged:** list the staged files with `git diff --cached --name-only --diff-filter=ACMR -z`, skip symlinks and files with unstaged changes, run both formatters, and `git add` a file that changed. `GIT_INDEX_FILE` and the other git variables pass to each child.
- **Formatters (Q24):** runs `node ~/.claude/hooks/<formatter>/command.ts` with a Write payload on stdin. That costs about 18 ms for each file and formatter. A commit of 5 files adds about 180 ms.
- **Wiring:** `dot_config/git/config` changes its `command` to `node "$HOME/.config/git/hooks/format-staged-files/main.ts"`, behind `command -v node >/dev/null || exit 0` and with `|| true`, so a missing or old `node` never stops a commit.

### lint-prose

Same shape as spike 2, on Write and Edit only.

- **Core:** maps each Vale alert to its paragraph, keeps the alerts in paragraphs that git reports as changed, and drops the alerts that this session already reported. The `git diff -U0` hunk parse and the paragraph map become pure functions.
- **Vale:** keeps `bash ~/.config/vale/scripts/check.sh <file>` as one `run` call, because the `prose-cleanup` skill uses the same script.
- **Session state:** `${TMPDIR}/lint-prose-<session id>` as today. The mod gets the id from `$.session.id()`, pi from `ctx.sessionManager.getSessionId()`, and Codex from the payload. `$.fs` has no append, so the core reads the file and writes it back with the new lines.
- **Messages for you, not the model:** `hook.sh` showed a message to you with exit 1, which does not block: Vale failed, the Vale config is missing, or every alert was a repeat. A mod and a pi extension have no such channel, so they send these messages as a notification (decision D2). Tested on 2026-10-19: `$.ui.notify` writes a native notification (OSC 777, title `lint-prose`) and nothing in the transcript. `ctx.ui.notify` shows the message on the pi screen.
- **Codex:** the `apply_patch` entry runs `command.ts` through `apply-patch.ts`. That removes `dot_codex/hooks/apply-patch.sh`, because `lint-prose` was its last user.

### type-check-all-languages

- **Claude Code: a command hook, not a mod.** This design first gave a mod on `classic.Stop`. In the cutover on 2026-10-19, Claude Code 2.1.303 loaded the mod but skipped it: `classic.Stop bypassed by cc-plugin-sec-default (tier user)`. For a Team organization, that built-in plugin sits outermost and skips each user mod on a `classic.*` event, but not on `tool.call`. So the `Stop` entry in `settings.json.tmpl` runs `command.ts`, as for `block-secret-commits`.
- **pi and omp:** `agent_end` sends the errors with `pi.sendMessage`, with `triggerTurn` and the `followUp` delivery, which starts one more run. pi and omp have no `stop_hook_active`, so the extension keeps a flag: the end of the run that it started passes, and the run after it is checked again. It starts no run after an aborted or failed run, or when omp sets `willContinue`. Tested live on 2026-10-19 in `pi -p` and in an interactive omp. `omp -p` aborts the run as it exits.
- **Why not `agent_before_settle`:** this design first gave pi's `agent_before_settle` with `{ entries, continue: true }`. In the cutover on 2026-10-19, omp 18.10.3 did not have that event, and its `turn_end` and `agent_end` take no result. `sendMessage` with `triggerTurn` is in both agents.
- **Codex:** the same `command.ts`, which reads `stop_hook_active` from stdin.
- **Tests:** `test/check.ts` runs `command.ts` with a stand-in `pyrefly` and `tsc` on `PATH` for pass, fail, no matching files, and `stop_hook_active`, and checks `pi.ts` with a stub. The cases gave the same result on `hook.sh`, except for a path that git quotes, such as `é.py`. The core reads `git -z` output, so that path now counts.

### track-session-changes

The largest port. You chose an async core that runs as a mod (feasibility, track-session-changes). The current core makes 51 synchronous calls: 47 file calls, 5 kinds of git command, `zlib`, and `crypto`.

**What the mod API cannot do, and the replacement:**

| Today                                               | Problem in the mod                                    | Replacement                                                                                                                                                 |
| --------------------------------------------------- | ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Blob: `sha1` and `deflateSync`, then a binary write | `$.fs.write` takes text only. No `CompressionStream`. | `git hash-object -w --stdin --path=<file> <file>`: the before text on stdin, the after file by path, one git start. With the filters of the repo, see below |
| `appendFileSync` of the log                         | No append                                             | `append` in `Io`. The mod runs `sh -c 'cat >> "$1"'` with the line on stdin.                                                                                |
| Index snapshot: copy, hard link, `utimes`, rename   | No copy, link, rename, or `utimes`                    | `copy`, `link`, `rename`, `remove` in `Io`. The mod runs `cp -p`, `ln`, `mv`, `rm -rf`.                                                                     |
| Prune of call links by `ctime`                      | `$.fs.stat` has no `ctime`                            | Put the creation time in the link name: `calls/<id>.<n>.<ms>.index`                                                                                         |
| `pending/<id>` file between Pre and Post            | Not a problem, but not needed                         | The mod and pi keep the pending state in memory across `next`. `command.ts` keeps the file.                                                                 |
| `diff-files` output up to 64 MiB                    | `$.process.run` keeps 4 MiB of each stream            | On `isStdoutTruncated`, log the paths with an unknown line                                                                                                  |
| `node:path`, `Buffer`, `process.pid`                | Not in the mod                                        | Small path functions in the core, `TextEncoder`, and `crypto.randomUUID()`                                                                                  |

**The `Io` of the core:** `read`, `write`, `append`, `exists`, `mtime`, `list`, `realpath`, `mkdir`, `copy`, `link`, `rename`, `remove`, and `run(argv, { env, stdin })`. `io.ts` implements them with `node:fs/promises` and `spawn`. The core uses `crypto.subtle.digest("SHA-1")` for the index name, which Node and the mod both have. The cutover added `mkdir`: git does not find a repo when the folder in `GIT_OBJECT_DIRECTORY` does not exist. It also named `stat` as `mtime` and dropped the `cwd` of `run`, because the core runs `git -C`.

**Adapters:** the mod hooks `tool.call` on Bash, Write, Edit, and NotebookEdit, and `session.start` for the prune, after `next`. It calls `beginCall` before `next` and `endCall` after it. On a deny or a throw, `dropCall` in a `finally` removes the index links and logs nothing. `pi.ts` replaces `dot_pi/agent/extensions/track-session-changes/` and the omp link to it. `command.ts` replaces `hook.ts` for Codex.

**Changes found in the cutover on 2026-10-19:**

- **Blob filters.** This design gave `--no-filters`. The cutover lets git apply the filters of the repo instead, through `--path=<file>` and `--stdin-paths`. The blob then gets the ID that `git add` gives, also for `core.autocrlf`, which the old hook did not read. The old hook read the attribute files itself and called git only when they named a filter.
- **A file outside every repo.** git writes no object outside a repo, so an empty bare repo, `blobs.git` in the session state, takes those writes, with `--no-filters`.
- **A file git cannot read.** `--stdin-paths` stops at that file, so the core starts git again for the files after it. The old hook lost only the blob of that file, and so does the new one.
- **Call links.** A link without a time in its name is from the old hook, and the prune deletes it at once.

**Tests:** 42 of the 43 checks of the old `test/check.ts` run against `command.ts`. The check of the in-process blob writer went with the writer. New checks cover a file that git cannot read, a Write outside a repo, and a quoted path with an emoji. 5 checks run the mod with a stub `$`, and the 7 checks of the old pi extension test run `pi.ts` with a stub pi. With `TRACK_HOOK`, all 56 checks also passed against the old `hook.ts`.

**Live on 2026-10-19:** Claude Code (Bash, a failed Bash call, a `cd`, Write, Edit, NotebookEdit, a subagent Bash call, and the prune), `pi -p`, `omp -p`, and `codex exec` with Bash and `apply_patch`. The blob IDs matched `git hash-object` of each file.

**Spike 3, before the port.** These facts decide whether the design holds:

| #   | Check                                                                               | Pass                                                 | Result on 2026-10-19                                                                                                                                                         |
| --- | ----------------------------------------------------------------------------------- | ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `$.process.run` with `stdin` keeps CRLF, a NUL byte, and characters outside the BMP | `hash-object` gives the same id as Node `sha1`       | Pass. Also with `-w`, stdin, and a path in one start: git gives both ids. The stdout of `printf` keeps a NUL, a CR, and an emoji.                                            |
| 2   | Time of the mod for one Bash call, Pre and Post, in a repository with 1,000 files   | Not slower than `node hook.ts` for the same call     | Pass. For 8 Bash calls, the mod took 14 to 30 ms before the call and 9 to 24 ms after it. `node hook.ts` took 30 to 41 ms before and 27 to 57 ms after, in the same session. |
| 3   | `$.session.cwd()` in `tool.call` follows a `cd` in an earlier Bash call             | Same folder as the payload `cwd` of the command hook | Pass. After `cd sub`, the next 9 calls gave `sub` in both.                                                                                                                   |
| 4   | `originalFile` and `structuredPatch` in the mod's Edit and Write result             | Same as `tool_response` in the command hook          | Pass. The whole result is the same for a new Write, a Write over a file, and two Edits. For a CRLF file, both give `originalFile` with LF line ends.                         |
| 5   | `crypto.subtle.digest("SHA-1")` in the mod                                          | Returns the digest                                   | Pass, in less than 1 ms. `crypto.randomUUID()` also works.                                                                                                                   |
| 6   | `session.start` in a mod, with `cc-plugin-sec-default` in front                     | The hook runs                                        | Pass. The plugin skips only `classic.*` events.                                                                                                                              |

The spike ran in Claude Code 2.1.303. The snapshot as one `sh -c` script took 6 to 10 ms, against 14 to 30 ms for one `$` call per step. Check 2 passed without it, so the port keeps one `Io` function per step, which the tests can replace one by one. If check 2 had failed, the snapshot would run as one `sh -c` script through `run`. If check 1 had failed, the mod would keep `command.ts` as a command hook in Claude Code, as `block-secret-commits` does.

## Cutover steps for a hook

One hook for each commit (Q14). For each hook:

1. **Code:** write `core.ts`, `io.ts`, and the adapters it needs.
2. **Tests:** port every case of `test/test.sh` to `test/check.ts`, then run both against the old and the new hook. They must give the same exit code and output, except for the approved changes.
3. **Remove:** delete `hook.sh` and `test/test.sh`, and add `.claude/hooks/<hook>/hook.sh` to `.chezmoiremove` (decision D3). `.chezmoiignore` keeps `test/` out of the home folder, so it needs no entry.
4. **Wire:** change the entries in the [wiring table](#wiring).
5. **Docs:** update the hook README (agents table, failure behavior, dependencies, files), its row in `dot_claude/hooks/README.md`, and the status table in this document.
6. **Check:** run `just hooks-check`, then one live call in Claude Code, pi, and omp. Run one in Codex.
7. **Commit,** then run `just chezmoi` in the devcontainer and on the host.
8. **After the apply:** trust the changed Codex entries in the Codex TUI on both machines.

## Cutover order

The agreed order (Q14), with `lint-all-languages` moved to the front (decision D1):

1. `lint-all-languages`, with `apply-patch.ts`
2. `block-commit-attribution`
3. `block-secret-commits`
4. `format-all-languages` and `format-org-tables`, then `format-staged-files`
5. `lint-prose`
6. `type-check-all-languages`
7. Spike 3, then `track-session-changes`

## Decisions

You took each recommendation on 2026-10-19.

| #   | Question                                                            | Decision                                                                                                                                                                    | Why                                                                                                                                                            |
| --- | ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Move `lint-all-languages` to the front of the order?                | Yes                                                                                                                                                                         | Its code and tests are done, and its cutover builds `apply-patch.ts`, which the formatters and `lint-prose` need later.                                        |
| D2  | Where do the `lint-prose` messages for you go in the mod and in pi? | A notification: `$.ui.notify` in the mod, `ctx.ui.notify` in pi. Codex keeps stderr.                                                                                        | A Vale failure stays visible, and the model does not get text that is not for it. Test both calls in the cutover.                                              |
| D3  | How do the old `hook.sh` files leave `~/.claude/hooks/`?            | A `.chezmoiremove` file lists them, so `just chezmoi` removes them on both machines.                                                                                        | There are 7 more cutovers, each on two machines.                                                                                                               |
| D4  | Do the two Codex `PreToolUse` hooks stay off?                       | No. `dot_codex/modify_private_config.toml` removes `enabled = false` from each `pre_tool_use` entry in `hooks.state` at each apply.                                         | `block-secret-commits` and `enforce-cli-tools` then run in Codex. The repo does not write `trusted_hash`, so you still trust each changed entry once in Codex. |
| D5  | Warn when `node` is missing?                                        | Yes. A `SessionStart` entry in Claude Code and Codex runs `node -p process.features.typescript` and prints a `systemMessage` when the answer is not `strip` or `transform`. | A command entry that exits 0 with no `node` gives no sign. One check for each session gives one warning, not one for each call. Taken on 2026-10-19.           |
