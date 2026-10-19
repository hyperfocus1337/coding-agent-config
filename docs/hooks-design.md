# Hooks as mods: design

This document says how each hook in [`dot_claude/hooks/`](../dot_claude/hooks/README.md) moves to one TypeScript core that Claude Code, pi, omp, and Codex share. [`hooks-feasibility.md`](hooks-feasibility.md) holds the facts, the spikes, and the agreed plan that this design uses. This document holds the rules for each hook folder, the design of each hook that has not moved, the cutover steps, and the decisions.

Written on 2026-10-18, with Claude Code 2.1.302, pi 1.1.0, omp 18.10.3, Codex 0.162.1, and Node 26.11.1.

## Status

| Hook                       | State                                                                |
| -------------------------- | -------------------------------------------------------------------- |
| `enforce-cli-tools`        | Moved. Live in Claude Code, pi, and omp. Codex runs `command.ts`.    |
| `lint-all-languages`       | Code and tests done (spike 2). Not wired: `hook.sh` still runs.      |
| `block-commit-attribution` | Not started                                                          |
| `block-secret-commits`     | Not started                                                          |
| `format-all-languages`     | Not started                                                          |
| `format-org-tables`        | Not started                                                          |
| `format-staged-files`      | Not started. Moves to `dot_config/git/hooks/`.                       |
| `lint-prose`               | Not started                                                          |
| `type-check-all-languages` | Not started                                                          |
| `track-session-changes`    | Not started. Needs an async core and a spike first, see its section. |

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
- **Timeouts.** `$.process.run` stops a program after 30 s. Pass `timeoutMs` where today's settings entry gives more, such as 60 s for `type-check-all-languages`.
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
- **Wiring:** `dot_config/git/config` changes its `command` to `node "$HOME/.config/git/hooks/format-staged-files/main.ts"`.

### lint-prose

Same shape as spike 2, on Write and Edit only.

- **Core:** maps each Vale alert to its paragraph, keeps the alerts in paragraphs that git reports as changed, and drops the alerts that this session already reported. The `git diff -U0` hunk parse and the paragraph map become pure functions.
- **Vale:** keeps `bash ~/.config/vale/scripts/check.sh <file>` as one `run` call, because the `prose-cleanup` skill uses the same script.
- **Session state:** `${TMPDIR}/lint-prose-<session id>` as today. The mod gets the id from `$.session.id()`, pi from `ctx.sessionManager.getSessionId()`, and Codex from the payload. `$.fs` has no append, so the core reads the file and writes it back with the new lines.
- **Messages for you, not the model:** today exit 1 shows a message to you without blocking: Vale failed, the Vale config is missing, or every alert was a repeat. A mod and a pi extension have no such channel, so they send these messages as a notification (decision D2).

### type-check-all-languages

- **Mod:** `classic.Stop` returns `{ block: output }`, and does nothing when `e.stop_hook_active` is true. The root comes from `git rev-parse --show-toplevel` in `$.session.cwd()`. `pyrefly check` and `tsc --noEmit` get a `timeoutMs` of 60 s.
- **pi:** `agent_before_settle` returns `{ entries, continue: true }`, with the errors in an appended entry. pi has no `stop_hook_active`, so the extension keeps a flag for each turn: it continues once, then lets the next stop pass. This is not tested yet.
- **Codex:** `command.ts` reads `stop_hook_active` from stdin.
- **Tests:** the hook has none today. Add `test/check.ts` with a fake `run` for pass, fail, and `stop_hook_active`.

### track-session-changes

The largest port. You chose an async core that runs as a mod (feasibility, track-session-changes). The current core makes 51 synchronous calls: 47 file calls, 5 kinds of git command, `zlib`, and `crypto`.

**What the mod API cannot do, and the replacement:**

| Today                                               | Problem in the mod                                    | Replacement                                                                                                             |
| --------------------------------------------------- | ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Blob: `sha1` and `deflateSync`, then a binary write | `$.fs.write` takes text only. No `CompressionStream`. | `git hash-object -w --no-filters --stdin <after path>`: the before text on stdin, the after file by path, one git start |
| `appendFileSync` of the log                         | No append                                             | `append` in `Io`. The mod runs `sh -c 'cat >> "$1"'` with the line on stdin.                                            |
| Index snapshot: copy, hard link, `utimes`, rename   | No copy, link, rename, or `utimes`                    | `copy`, `link`, `rename`, `remove` in `Io`. The mod runs `cp -p`, `ln`, `mv`, `rm -rf`.                                 |
| Prune of call links by `ctime`                      | `$.fs.stat` has no `ctime`                            | Put the creation time in the link name: `calls/<id>.<n>.<ms>.index`                                                     |
| `pending/<id>` file between Pre and Post            | Not a problem, but not needed                         | The mod and pi keep the pending state in memory across `next`. `command.ts` keeps the file.                             |
| `diff-files` output up to 64 MiB                    | `$.process.run` keeps 4 MiB of each stream            | On `isStdoutTruncated`, log the paths with an unknown line                                                              |
| `node:path`, `Buffer`, `process.pid`                | Not in the mod                                        | Small path functions in the core, `TextEncoder`, and `crypto.randomUUID()`                                              |

**The `Io` of the core:** `read`, `write`, `append`, `exists`, `stat`, `list`, `realpath`, `copy`, `link`, `rename`, `remove`, and `run(argv, { cwd, env, stdin })`. `io.ts` implements them with `node:fs/promises` and `spawn`. The core uses `crypto.subtle.digest("SHA-1")` for the index name, which Node and the mod both have.

**Adapters:** the mod hooks `tool.call` on Bash, Write, Edit, and NotebookEdit, and `session.start` for the prune. It calls `beginCall` before `next` and `endCall` in a `finally` after it, so a denied call also cleans up. `pi.ts` replaces the current `dot_pi/agent/extensions/track-session-changes/`. `command.ts` replaces `hook.ts` for Codex.

**Spike 3, before the port.** These facts decide whether the design holds:

| #   | Check                                                                               | Pass                                                 |
| --- | ----------------------------------------------------------------------------------- | ---------------------------------------------------- |
| 1   | `$.process.run` with `stdin` keeps CRLF, a NUL byte, and characters outside the BMP | `hash-object` gives the same id as Node `sha1`       |
| 2   | Time of the mod for one Bash call, Pre and Post, in a repository with 1,000 files   | Not slower than `node hook.ts` for the same call     |
| 3   | `$.session.cwd()` in `tool.call` follows a `cd` in an earlier Bash call             | Same folder as the payload `cwd` of the command hook |
| 4   | `originalFile` and `structuredPatch` in the mod's Edit and Write result             | Same as `tool_response` in the command hook          |
| 5   | `crypto.subtle.digest("SHA-1")` in the mod                                          | Returns the digest                                   |

If check 2 fails, the snapshot runs as one `sh -c` script through `run`, which costs one process start instead of four. If check 1 fails, the mod keeps `command.ts` as a command hook in Claude Code, as `block-secret-commits` does.

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

| #   | Question                                                            | Decision                                                                                                                            | Why                                                                                                                                                            |
| --- | ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Move `lint-all-languages` to the front of the order?                | Yes                                                                                                                                 | Its code and tests are done, and its cutover builds `apply-patch.ts`, which the formatters and `lint-prose` need later.                                        |
| D2  | Where do the `lint-prose` messages for you go in the mod and in pi? | A notification: `$.ui.notify` in the mod, `ctx.ui.notify` in pi. Codex keeps stderr.                                                | A Vale failure stays visible, and the model does not get text that is not for it. Test both calls in the cutover.                                              |
| D3  | How do the old `hook.sh` files leave `~/.claude/hooks/`?            | A `.chezmoiremove` file lists them, so `just chezmoi` removes them on both machines.                                                | There are 7 more cutovers, each on two machines.                                                                                                               |
| D4  | Do the two Codex `PreToolUse` hooks stay off?                       | No. `dot_codex/modify_private_config.toml` removes `enabled = false` from each `pre_tool_use` entry in `hooks.state` at each apply. | `block-secret-commits` and `enforce-cli-tools` then run in Codex. The repo does not write `trusted_hash`, so you still trust each changed entry once in Codex. |
