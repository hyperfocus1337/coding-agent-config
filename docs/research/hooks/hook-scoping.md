# Hook scoping: the events each hook attaches to

Checks, for each hook in [`dot_claude/hooks/`](../../../dot_claude/hooks/README.md), that it attaches to the right event, matcher, and tool names in Claude Code, pi, omp, and Codex. [`docs/hooks/platforms.md`](../../hooks/platforms.md) holds the API facts of each agent, and this file does not repeat them. It replaces `hook-events.md`, which used the old hook names, and re-checks its 5 findings. A new `toggle-hook` folder appeared as uncommitted work while this check ran. It attaches to `session.start`, `command.run`, and `session_start` only, and this file does not check it.

Read from source and tested live on 2026-10-19. Each finding says which parts were tested live.

| Agent       | Version | Source                                                                                                                                                                                               |
| ----------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Claude Code | 2.1.303 | `claude --version`; the mod types in `~/.claude/hooks/<hook>/.claude-plugin/types/claude-code/index.d.ts` and the tool table in `types/claude-code-tools/index.d.ts`; `~/.claude/cache/changelog.md` |
| pi          | 1.3.0   | `pi --version`; the installed package `@earendil-works/pi-coding-agent` (`dist/`, `docs/`)                                                                                                           |
| omp         | 18.12.2 | `omp --version`; the npm tarball `@oh-my-pi/pi-coding-agent@18.12.2`, which holds the TypeScript source (`src/`)                                                                                     |
| Codex       | 0.163.0 | `codex --version`; `codex app-server generate-json-schema`; upstream source at tag `rust-v0.163.0` (commit `83086188`)                                                                               |

## Current attachments

Read from the adapters. "Before" means that the hook acts before the tool runs. "After" means that it acts after the tool. A mod hook on `tool.call` acts after the tool when it calls `next` first.

| Hook                       | Claude Code                                                                                                                      | pi and omp (`pi.ts`)                                                                  | Codex ([`modify_hooks.json`](../../../dot_codex/modify_hooks.json))                                  |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `block-commit-attribution` | Mod `tool.call` `Bash`, before (`hooks/register.ts:11`)                                                                          | `tool_call` `bash`, before (`pi.ts:11`)                                               | Not wired                                                                                            |
| `block-secret-commits`     | Settings `PreToolUse` `Bash`, `guard.sh` (`settings.json.tmpl:27-37`)                                                            | `tool_call` `bash`, before (`pi.ts:13`)                                               | `PreToolUse` `Bash`, `guard.sh` (line 89)                                                            |
| `enforce-cli-tools`        | Mod `tool.call` `Bash`, before (`hooks/register.ts:11`)                                                                          | `tool_call` `bash`, before (`pi.ts:12`)                                               | `PreToolUse` `Bash` (line 94)                                                                        |
| `format-prettier`          | Mod `tool.call` `Write`, `Edit`, `Bash`, after (`hooks/register.ts:13`)                                                          | `tool_result` `write`, `edit`, `bash` (`pi.ts:13-14`)                                 | `PostToolUse` `Bash` (line 22); `apply_patch` through `apply-patch.ts` (line 52)                     |
| `format-org-tables`        | Mod `tool.call` `Write`, `Edit`, `Bash`, after (`hooks/register.ts:13`)                                                          | `tool_result` `write`, `edit`, `bash` (`pi.ts:13-14`)                                 | `PostToolUse` `Bash` (line 27); `apply_patch` (line 57)                                              |
| `format-code`              | Mod `tool.call` `Write`, `Edit`, `Bash`, after (`hooks/register.ts:13`)                                                          | `tool_result` `write`, `edit`, `bash` (`pi.ts:13-14`)                                 | `PostToolUse` `Bash` (line 32); `apply_patch` (line 62)                                              |
| `lint-code`                | Mod `tool.call` `Write`, `Edit`, `Bash`, after (`hooks/register.ts:12`)                                                          | `tool_result` `write`, `edit`, `bash` (`pi.ts:12-13`)                                 | `PostToolUse` `Bash` (line 37); `apply_patch` (line 67)                                              |
| `lint-prose`               | Mod `tool.call` `Write`, `Edit`, after, skips a failed call (`hooks/register.ts:12-15`)                                          | `tool_result` `write`, `edit`, skips `isError` (`pi.ts:13-15`)                        | `PostToolUse` `apply_patch` (line 72)                                                                |
| `type-check-tsc`           | Settings `Stop` (`settings.json.tmpl:50-57`)                                                                                     | `agent_end`, then `pi.sendMessage` with `triggerTurn` (`pi.ts:19-44`)                 | `Stop` (line 137)                                                                                    |
| `type-check-pyrefly`       | Settings `Stop` (`settings.json.tmpl:58-62`)                                                                                     | `agent_end`, then `pi.sendMessage` with `triggerTurn` (`pi.ts:19`)                    | `Stop` (line 142)                                                                                    |
| `track-session-changes`    | Mod `tool.call` `Bash` before and after, `Write`, `Edit`, `NotebookEdit` after; mod `session.start` (`hooks/register.ts:84-143`) | `tool_call`, `tool_result` `bash`, `write`, `edit`; `session_start` (`pi.ts:105-162`) | `PreToolUse` and `PostToolUse` `Bash` and `apply_patch`; `SessionStart` (lines 42, 77, 99, 109, 126) |

Paths in the first two columns are relative to the hook folder. Claude Code loads the 8 mods from `CLAUDE_CODE_PLUGIN_DIRS` (`settings.json.tmpl:12`). pi loads the 11 `pi.ts` files from `dot_pi/agent/modify_settings.json:32-43`, and omp loads them from `extensions` in `dot_omp/private_agent/private_config.yml`. The applied `~/.codex/hooks.json` in the devcontainer has the same entries as `modify_hooks.json`.

## Verdicts

| Hook                       | Agent       | Event used                                                               | Event it should use                                       | Verdict           |
| -------------------------- | ----------- | ------------------------------------------------------------------------ | --------------------------------------------------------- | ----------------- |
| `block-commit-attribution` | Claude Code | Mod `tool.call` `Bash`, before                                           | Same                                                      | Correct           |
| `block-commit-attribution` | pi          | `tool_call` `bash`                                                       | Same                                                      | Correct           |
| `block-commit-attribution` | omp         | `tool_call` `bash`                                                       | Same                                                      | Correct           |
| `block-commit-attribution` | Codex       | None                                                                     | `PreToolUse` `Bash`                                       | Gap (finding 4)   |
| `block-secret-commits`     | Claude Code | `PreToolUse` `Bash`                                                      | Same                                                      | Correct           |
| `block-secret-commits`     | pi          | `tool_call` `bash`                                                       | Same                                                      | Correct           |
| `block-secret-commits`     | omp         | `tool_call` `bash`                                                       | Same                                                      | Correct           |
| `block-secret-commits`     | Codex       | `PreToolUse` `Bash`                                                      | Same                                                      | Correct           |
| `enforce-cli-tools`        | Claude Code | Mod `tool.call` `Bash`, before                                           | Same                                                      | Correct           |
| `enforce-cli-tools`        | pi          | `tool_call` `bash`                                                       | Same                                                      | Correct           |
| `enforce-cli-tools`        | omp         | `tool_call` `bash`                                                       | Same                                                      | Correct           |
| `enforce-cli-tools`        | Codex       | `PreToolUse` `Bash`                                                      | Same                                                      | Correct           |
| `format-prettier`          | Claude Code | Mod `tool.call` `Write`, `Edit`, `Bash`, after                           | Same                                                      | Correct           |
| `format-prettier`          | pi          | `tool_result` `write`, `edit`, `bash`                                    | Same                                                      | Correct           |
| `format-prettier`          | omp         | `tool_result` `write`, `edit`, `bash`                                    | Same, plus `ast_edit` (through `xd://resolve`) and `eval` | Gap (finding 2)   |
| `format-prettier`          | Codex       | `PostToolUse` `Bash`, `apply_patch`                                      | Same                                                      | Gap (finding 3)   |
| `format-org-tables`        | Claude Code | Mod `tool.call` `Write`, `Edit`, `Bash`, after                           | Same                                                      | Correct           |
| `format-org-tables`        | pi          | `tool_result` `write`, `edit`, `bash`                                    | Same                                                      | Correct           |
| `format-org-tables`        | omp         | `tool_result` `write`, `edit`, `bash`                                    | Same, plus `ast_edit` and `eval`                          | Gap (finding 2)   |
| `format-org-tables`        | Codex       | `PostToolUse` `Bash`, `apply_patch`                                      | Same                                                      | Gap (finding 3)   |
| `format-code`              | Claude Code | Mod `tool.call` `Write`, `Edit`, `Bash`, after                           | Same                                                      | Correct           |
| `format-code`              | pi          | `tool_result` `write`, `edit`, `bash`                                    | Same                                                      | Correct           |
| `format-code`              | omp         | `tool_result` `write`, `edit`, `bash`                                    | Same, plus `ast_edit` and `eval`                          | Gap (finding 2)   |
| `format-code`              | Codex       | `PostToolUse` `Bash`, `apply_patch`                                      | Same                                                      | Gap (finding 3)   |
| `lint-code`                | Claude Code | Mod `tool.call` `Write`, `Edit`, `Bash`, after                           | Same, plus `NotebookEdit`                                 | Gap (finding 5)   |
| `lint-code`                | pi          | `tool_result` `write`, `edit`, `bash`                                    | Same                                                      | Correct           |
| `lint-code`                | omp         | `tool_result` `write`, `edit`, `bash`                                    | Same, plus `ast_edit` and `eval`                          | Gap (finding 2)   |
| `lint-code`                | Codex       | `PostToolUse` `Bash`, `apply_patch`                                      | Same                                                      | Gap (finding 3)   |
| `lint-prose`               | Claude Code | Mod `tool.call` `Write`, `Edit`, after                                   | Same                                                      | Correct           |
| `lint-prose`               | pi          | `tool_result` `write`, `edit`                                            | Same                                                      | Correct           |
| `lint-prose`               | omp         | `tool_result` `write`, `edit`                                            | Same                                                      | Correct           |
| `lint-prose`               | Codex       | `PostToolUse` `apply_patch`                                              | Same                                                      | Gap (finding 3)   |
| `type-check-tsc`           | Claude Code | `Stop` command hook                                                      | Same                                                      | Correct           |
| `type-check-tsc`           | pi          | `agent_end` with `pi.sendMessage`                                        | Same                                                      | Correct           |
| `type-check-tsc`           | omp         | `agent_end` with `pi.sendMessage`                                        | `session_stop`                                            | Wrong (finding 1) |
| `type-check-tsc`           | Codex       | `Stop`                                                                   | Same                                                      | Correct           |
| `type-check-pyrefly`       | Claude Code | `Stop` command hook                                                      | Same                                                      | Correct           |
| `type-check-pyrefly`       | pi          | `agent_end` with `pi.sendMessage`                                        | Same                                                      | Correct           |
| `type-check-pyrefly`       | omp         | `agent_end` with `pi.sendMessage`                                        | `session_stop`                                            | Wrong (finding 1) |
| `type-check-pyrefly`       | Codex       | `Stop`                                                                   | Same                                                      | Correct           |
| `track-session-changes`    | Claude Code | Mod `tool.call` `Bash`, `Write`, `Edit`, `NotebookEdit`; `session.start` | Same                                                      | Correct           |
| `track-session-changes`    | pi          | `tool_call`, `tool_result`; `session_start`                              | Same                                                      | Correct           |
| `track-session-changes`    | omp         | `tool_call`, `tool_result`; `session_start`                              | Same, plus `ast_edit` and `eval`                          | Gap (finding 2)   |
| `track-session-changes`    | Codex       | `PreToolUse`, `PostToolUse` `Bash`, `apply_patch`; `SessionStart`        | Same                                                      | Gap (finding 3)   |

The 4 Codex rows with finding 3 have the right event. The gap is that Codex sends no `PostToolUse` for one form of patch, so the fix goes into `enforce-cli-tools`.

## Findings

### 1. omp: the type checks should use `session_stop`, not `agent_end`

**Evidence.** omp sends `agent_end` to extensions with `void this.#emitAgentEndNotification(...)` (`src/session/agent-session.ts:5338`), so it does not wait for the handler. omp awaits `session_stop` (`agent-session.ts:4813`, `:5365`) and sends it only in the main agent (`:5361`). The event has `stop_hook_active` (`src/extensibility/shared-events.ts:110-120`), and the result takes `continue` and `additionalContext` (`src/extensibility/extensions/types.ts:492-501`). pi 1.3.0 awaits `agent_end` (`dist/core/agent-session.js:889`), and a message that an `agent_end` handler queues starts one more run (`agent-session.js:1533-1535`), so pi is correct.

**Tested live.** Each test used a git repo with `tsconfig.json` and an untracked `a.ts` with a type error, and the prompt "Reply with the single word ready".

- pi, with `pi -p --no-session -ne -e ~/.claude/hooks/type-check-tsc/pi.ts --mode json`: the event stream had `agent_end`, then a second `agent_start`, and the model fixed `a.ts`.
- omp, with `omp -p --no-session --no-extensions -e ~/.claude/hooks/type-check-tsc/pi.ts --mode json`: omp exited after 2.9 s with one run, and `a.ts` kept the error. `tsc --noEmit` took 217 ms in that repo. So the run is lost also with a fast check, not only with the 5 s check that `hook-events.md` tested.
- omp, with a test copy of the hook that returns `{ continue: true, additionalContext: errors }` from `session_stop` when `stop_hook_active` is false: omp ran one more turn, and the model fixed `a.ts`. A probe extension logged `session_stop` before `agent_end`.

**Fix.** In `type-check-tsc/pi.ts` and `type-check-pyrefly/pi.ts`, add a `session_stop` handler that runs `check` and returns `{ continue: true, additionalContext: errors }`, and returns nothing when `event.stop_hook_active` is true. Keep the `agent_end` handler for pi. Make it return at once when a `session_stop` event came first in the same run, because omp sends `session_stop` before `agent_end` and pi never sends `session_stop`. Update the comment at `pi.ts:8-9`.

### 2. omp: `ast_edit` and `eval` change files that no file hook sees

**Evidence.** The built-in tools of omp include `ast_edit` and `eval` (`src/tools/builtin-names.ts`). `ast_edit` is on by default (`src/tools/settings.ts:508-512`), and `eval` is on when one of its backends is available (`src/tools/index.ts:664`). The hooks match only `write`, `edit`, and `bash`, and read `input.path`, `input.paths`, or `input.command`.

**Tested live.** The test ran `omp -p --no-session --no-extensions` with a probe extension that logs each `tool_call` and `tool_result`. The probe was necessary because `lint-code` skips each file under `/tmp/` (`lint-code/core.ts:66-79`), so the real hook gives no output in a test repo there. The model renamed a function in `m.py` with `ast_edit`, and wrote `n.py` with `eval`. Both files changed on disk, and `ruff check` finds 2 errors in them.

- `ast_edit` came as a `write` to `xd://ast_edit`, then a nested `ast_edit` result with `applied: false`. The file changed at a later `write` to `xd://resolve`. Its `details.xdev.inner` has `sourceToolName: "ast_edit"` and `sourceResultDetails.files: ["m.py"]` with `applied: true`. No event named `m.py` in `path` or `paths`.
- `eval` came as `tool_call` and `tool_result` with `toolName: "eval"` and the Python code in `input.code`. No event named `n.py`.

**Fix.** In the `pi.ts` of `format-prettier`, `format-org-tables`, `format-code`, `lint-code`, and `track-session-changes`:

- On a `write` result with `input.path === "xd://resolve"`, read `details.xdev.inner`. When `sourceToolName` is `ast_edit` and `sourceResultDetails.applied` is true, treat each entry of `sourceResultDetails.files`, resolved against `ctx.cwd`, as an edited file.
- Treat `eval` as `bash`: send `input.code` as the command text to the Bash branch of each core. `lint-code` then lints only the named paths whose mtime says that the call wrote them. `track-session-changes` snapshots on `tool_call` and compares on `tool_result`, as it does for `bash`.

`lint-prose` does not run on Bash because an mtime is not proof of a write (`dot_claude/hooks/README.md`, "A path a command names is not always a path it wrote"). The same reason applies to `eval`, so `lint-prose` stays as it is. `ast_edit` rewrites code, not prose.

### 3. Codex: an `apply_patch` sent as a shell command gets no `PostToolUse`

**Evidence.** `exec_command` sends `PreToolUse` with the tool name `Bash` (`codex-rs/core/src/tools/handlers/unified_exec/exec_command.rs:506-516`). Then it calls `intercept_apply_patch` (`:365`). When the command is a patch, Codex applies it and returns an output with `hook_command: None` (`:377-391`). With no `hook_command`, the output gives no `PostToolUse` input or response (`core/src/tools/context.rs:432-441`), so no `PostToolUse` fires.

The hook event list from `codex app-server generate-json-schema` has 12 events and no `postToolUseFailure`.

**Tested live.** `codex exec --json --ephemeral --dangerously-bypass-hook-trust` with two probe hooks added through `-c hooks.PreToolUse=...` and `-c hooks.PostToolUse=...`, matcher `*`. The probe logged each payload. The model sent the first patch as a shell command and the second through the `apply_patch` tool, and both files were created:

| Patch sent as | Events logged                                           |
| ------------- | ------------------------------------------------------- |
| Shell command | `PreToolUse` `Bash` only                                |
| `apply_patch` | `PreToolUse` `apply_patch`, `PostToolUse` `apply_patch` |

So the formatters, `lint-code`, `lint-prose`, and the after half of `track-session-changes` skip a shell patch. In the 21 sessions in `~/.codex/sessions` (2026-07-23 to 2026-10-19), the model made 113 `exec` (code mode) calls with 100 nested `exec_command` calls and 16 nested `apply_patch` calls. No `exec_command` call sent a patch.

**Fix.** Add the line `apply_patch	the apply_patch tool` to `dot_claude/hooks/enforce-cli-tools/rules`. Codex runs `PreToolUse` before the tool (`core/src/tools/registry.rs:701`), so the hook blocks the shell patch, and the model sends it again through the tool, which gets `PostToolUse`. A check with `core.ts` showed that the rule matches `apply_patch <<'EOF' ...` and does not match `rg apply_patch src`. The rule has no effect in the other agents, which have no `apply_patch` program.

### 4. Codex: `block-commit-attribution` is not wired

**Evidence.** `dot_codex/modify_hooks.json` has no entry for the hook, and the hook has no `command.ts`. [`decisions.md`](../../hooks/decisions.md#the-move-added-no-hook-to-codex) records that the move to TypeScript added no new Codex hook. The Codex source at `rust-v0.163.0` has no `Co-Authored-By` text in `codex-rs/core/src`, so Codex does not add the trailer itself.

In the 21 Codex sessions, the trailer text occurs only in the rules that tell the model not to write it. Read from source and transcripts only.

**Fix.** Low priority. If the hook should run in Codex, add a `command.ts` that reads `tool_input.command` and exits 2 with the reason on stderr, as `enforce-cli-tools/command.ts` does. Then add it to the `PreToolUse` `Bash` group in `modify_hooks.json`, and trust the hook again in the Codex TUI.

### 5. Claude Code: `lint-code` skips `NotebookEdit`

**Evidence.** The built-in tools that write files are `Write`, `Edit`, and `NotebookEdit` (`types/claude-code-tools/index.d.ts:294`, `:418`, `:810`). `NotebookEdit` names its file in `notebook_path` (`:419-420`). Only `track-session-changes` matches it. `lint-code/core.ts:113-128` has no `ipynb` case.

**Tested live.** `ruff check` on a `.ipynb` file with an unused import reported F401 at `n.ipynb:cell 1:1:8`. `prettier --check` on the same file failed with "Error occurred when checking code style", so the formatters are correct to skip notebooks. The 302 transcript files in `~/.claude/projects/` (2026-09-19 to 2026-10-19) have 2 `NotebookEdit` calls and 772 `Write` and `Edit` calls, so the gap is small.

**Fix.** In `lint-code/hooks/register.ts`, add `NotebookEdit` to the tool list and send `e.notebook_path` as the file path. In `lint-code/core.ts`, add `case "ipynb":` to the ruff case.

## Checked with no finding

- **Claude Code `tool.call`.** The event fires before the permission prompt and the tool, and `next(e)` runs both (`types/claude-code/index.d.ts:4045-4055`). The tools of a subagent "raise their own `tool.call`" (`:13394-13395`). The type checks run as `Stop` command hooks, not on `classic.Stop`, because `cc-plugin-sec-default` skips a user mod on `classic.*` ([`platforms.md`](../../hooks/platforms.md#claude-code-mods)). Read from source only.
- **Claude Code tool names.** This build has no `MultiEdit` and no `PowerShell` tool. `Monitor` runs a shell command (`claude-code-tools/index.d.ts:405-417`) that no guard sees, but it watches output, and the transcripts have 0 `Monitor` calls.
- **Background commands.** A Claude Code Bash call with `run_in_background: true`, and an omp `bash` call with `async: true`, return before the command ends, so the after hooks run too early. The Claude Code transcripts have 4 such calls in 5,629 Bash calls. The git `pre-commit` hook [`format-staged-files`](../../../dot_config/git/hooks/format-staged-files/README.md) formats what such a command commits. Codex sends the `Bash` `PostToolUse` of a long command when a later `write_stdin` call sees it end (`core/src/tools/handlers/unified_exec/write_stdin.rs:151-158`).
- **pi tool calls from a tool.** A call that a `codemode` script makes goes through the same pipeline, with `tool_call` and `tool_result` (`dist/core/agent-session.js:385-407`). `codemode` is off by default (`docs/codemode.md:3`). `powershell` is an opt-in tool for Windows (`docs/windows.md:35`).
- **omp virtual paths.** omp sends some tools through `write` to a path such as `xd://lsp`, then a nested event with the real tool name follows (probe log). The hooks ignore these paths, because no such file exists. An omp `edit` sets `path` and `paths`, and each `pi.ts` reads both (probe log).
- **Codex failures and names.** A shell command that exits non-zero is a successful result (`core/src/tools/context.rs:409-411`), so `PostToolUse` fires (`core/src/tools/registry.rs:811-817`). The matcher `apply_patch` is the canonical name, and `Write` and `Edit` are aliases (`core/src/tools/hook_names.rs:34-37`). Nested calls in code mode go through the normal dispatch with hooks (`core/src/tools/code_mode/wait_handler.rs:216-221`).
- **MCP tools.** No hook matches an `mcp__*` tool. The only MCP calls in the transcripts are 83 `mcp__context7__*` calls, which read documentation, and Codex has only `context7` in `~/.codex/config.toml`. No MCP server here writes project files.
