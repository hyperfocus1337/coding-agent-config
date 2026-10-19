# Hook events in Claude Code, pi, omp, and Codex

Which points each agent lets you attach code to, what each point can change, and whether the hooks in [`dot_claude/hooks/`](../../../dot_claude/hooks/README.md) attach to the right ones.

Read from source on 2026-10-19. The findings at the end were also tested live on that date.

| Agent       | Version | Source                                                                                                                       |
| ----------- | ------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Claude Code | 2.1.303 | The binary, and the mod types that the engine writes to `~/.claude/hooks/<hook>/.claude-plugin/types/claude-code/index.d.ts` |
| pi          | 1.3.0   | `@earendil-works/pi-coding-agent` (`dist/core/extensions/types.d.ts`, `CHANGELOG.md`) and `@earendil-works/pi-agent-core`    |
| omp         | 18.12.2 | The npm tarball `@oh-my-pi/pi-coding-agent@18.12.2`, which holds the TypeScript source, checked against the binary strings   |
| Codex       | 0.163.0 | The binary, `codex app-server generate-json-schema`, and the upstream source at tag `rust-v0.163.0`                          |

[`docs/hooks/platforms.md`](../../hooks/platforms.md) holds the API facts that the hooks here depend on, with live tests.

## Five mechanisms

| Mechanism            | Where it is set             | Runs                      | A handler is                                                                    |
| -------------------- | --------------------------- | ------------------------- | ------------------------------------------------------------------------------- |
| Claude Code settings | `hooks` in `settings.json`  | Out of process            | A command, an HTTP call, an MCP tool, a prompt, or an agent, with a JSON answer |
| Claude Code mod      | A plugin's hooks module     | In process, no Node       | A TypeScript function that wraps `next`                                         |
| pi extension         | `extensions` in pi settings | In process, Node and jiti | A TypeScript function whose return value pi uses                                |
| omp extension        | `extensions` in omp config  | In process, Bun           | Same as pi, with a different event set                                          |
| Codex                | `~/.codex/hooks.json`       | Out of process            | A command, with an exit code and a JSON answer                                  |

A mod wraps the action: it can change the input before `next`, the result after `next`, or answer without `next`. A pi or omp handler and a command hook can only answer at the point where they fire.

## Claude Code settings hooks

33 events. **Add context** means text that the model reads. **Exit 2** means the hook exits with code 2.

| Event                 | Fires                                           | Matcher                                         | Control                                                                                               |
| --------------------- | ----------------------------------------------- | ----------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `Setup`               | `--init-only`, or `-p` mode                     | `init`, `maintenance`                           | Add context                                                                                           |
| `SessionStart`        | Session starts or resumes                       | `startup`, `resume`, `clear`, `compact`, `fork` | Add context, first user message, session title, `watchPaths`, skill rescan, `CLAUDE_ENV_FILE`         |
| `InstructionsLoaded`  | A `CLAUDE.md` or rule file loads                | Load reason                                     | Observe                                                                                               |
| `UserPromptSubmit`    | User submits a prompt, before a command expands | none                                            | Block, add context, session title, drop the original prompt                                           |
| `UserPromptExpansion` | A typed slash command expands                   | Command name                                    | Block, add context                                                                                    |
| `PreToolUse`          | Before a tool call                              | Tool name, `if` rule                            | Allow, ask, deny, `defer` (print mode), change input (validated against the tool schema), add context |
| `PermissionRequest`   | A permission dialog shows                       | Tool name, `if` rule                            | Allow with changed input or rules, or deny                                                            |
| `PermissionDenied`    | Auto mode denies a call                         | Tool name, `if` rule                            | Retry                                                                                                 |
| `PostToolUse`         | After a tool call succeeds                      | Tool name, `if` rule                            | Add context, change the output (`updatedToolOutput`), context for the auto-mode classifier            |
| `PostToolUseFailure`  | After a tool call fails                         | Tool name, `if` rule                            | Add context                                                                                           |
| `PostToolBatch`       | A batch of calls resolved                       | none                                            | Add context. Exit 2 stops the agent loop                                                              |
| `MessageDisplay`      | Assistant text shows on screen                  | none                                            | Change the text on screen. The stored message does not change                                         |
| `Notification`        | A notification is raised                        | 17 notification types                           | Observe                                                                                               |
| `Stop`                | Claude is about to finish its response          | none                                            | Block the stop, add context                                                                           |
| `StopFailure`         | The turn ends on an API error                   | Error type                                      | Observe. Output and exit code are ignored                                                             |
| `SubagentStart`       | A subagent starts                               | Agent type                                      | Add context for the subagent                                                                          |
| `SubagentStop`        | A subagent is about to finish                   | Agent type                                      | Block the stop, add context                                                                           |
| `TaskCreated`         | A task is being created                         | none                                            | Exit 2 prevents it                                                                                    |
| `TaskCompleted`       | A task is being marked complete                 | none                                            | Exit 2 prevents it                                                                                    |
| `TeammateIdle`        | A teammate is about to go idle                  | none                                            | Exit 2 keeps it working                                                                               |
| `PreCompact`          | Before compaction                               | `manual`, `auto`                                | Add compact instructions. Exit 2 blocks compaction                                                    |
| `PostCompact`         | After compaction                                | `manual`, `auto`                                | Observe                                                                                               |
| `PreModelSwitch`      | Before a model switch                           | Target model                                    | Allow, ask, deny                                                                                      |
| `PostModelSwitch`     | After the model changes                         | Target model                                    | Add context                                                                                           |
| `Elicitation`         | An MCP server asks the user for input           | Server name                                     | Answer it, or deny                                                                                    |
| `ElicitationResult`   | After the user answers                          | Server name                                     | Change the answer                                                                                     |
| `ConfigChange`        | A settings or skills file changes               | Settings source                                 | Exit 2 blocks the change                                                                              |
| `CwdChanged`          | The working directory changes                   | none                                            | `watchPaths`, `CLAUDE_ENV_FILE`                                                                       |
| `DirectoryAdded`      | `/add-dir`, or the SDK adds a repo root         | Source                                          | Add context, on `/add-dir` only                                                                       |
| `FileChanged`         | A watched file changes                          | File base names                                 | `watchPaths`, `CLAUDE_ENV_FILE`                                                                       |
| `WorktreeCreate`      | A worktree is created                           | none                                            | Replace the creation                                                                                  |
| `WorktreeRemove`      | A worktree is removed                           | none                                            | Replace the removal                                                                                   |
| `SessionEnd`          | The session ends                                | Reason                                          | Observe. Bounded to 1.5 s by default, at most 60 s                                                    |

Each event also accepts `continue: false`, `systemMessage`, `suppressOutput`, and `terminalSequence` (OSC 0, 1, 2, 9, 99, 777, and BEL only).

The hook types are `command`, `http`, `mcp_tool`, `prompt`, and `agent`. A `command` hook takes `args`, `shell`, `timeout`, `async`, `asyncRewake`, `once`, `statusMessage`, and `onFailure`. `onFailure: "block"` (command and HTTP hooks) turns a hook that cannot start, times out, or exits with another code into a block. It does not apply to async hooks, or on `Stop`, `SubagentStop`, `TaskCompleted`, and `TeammateIdle`. The default timeout is 600 s for a command, HTTP, or MCP tool hook, 30 s for a prompt hook, and 60 s for an agent hook.

## Claude Code mods

A mod registers `on(event, matcher?, hook)`, and the hook gets `($, e, next)`. Chain order: `prepend`, then `user`, then `append`, then `builtin`, then core. These are the events that a hook here can use:

| Event                                                                     | Fires                                                               | Control                                                                                    |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `tool.call`                                                               | Before a tool runs, before the permission prompt. In subagents too. | Deny, change input, answer without the tool, change the result after `next`, add `context` |
| `tool.check`                                                              | The permission verdict, after `tool.call` and `PreToolUse`          | Allow, ask, or deny                                                                        |
| `tool.describe`                                                           | A tool schema is rendered                                           | Rewrite the description, defer the tool                                                    |
| `agent.offer`, `agent.spawn`                                              | An agent type is listed or started                                  | Hide it, change its model, deny                                                            |
| `prompt.submit`                                                           | A prompt is submitted                                               | Rewrite the text, add context, drop it                                                     |
| `prompt.mention`                                                          | Each `@path`, before the read. No `tool.call` fires for this read.  | Deny, read another path, add context                                                       |
| `prompt.section`, `prompt.compose`, `prompt.context`, `prompt.attachment` | The system prompt, the first-message context, each reminder         | Rewrite, add, or drop parts                                                                |
| `command.run`, `skill.prompt`, `attribution.text`                         | A slash command runs, a skill expands, attribution text is composed | Rewrite, answer without running                                                            |
| `session.start`                                                           | Once per process, before the first prompt. Not on `/clear`.         | Observe, awaited                                                                           |
| `session.append`                                                          | Each transcript row, before it is stored                            | Rewrite the content                                                                        |
| `session.compact`                                                         | Before compaction                                                   | Rewrite or replace the result, skip it                                                     |
| `session.end`                                                             | The session ends                                                    | Observe, 1.5 s for all hooks together                                                      |
| `turn.start`, `turn.step`                                                 | A turn begins; each model request                                   | `turn.step`: change the model or effort, rewrite chunks, answer without a request          |
| `turn.complete`                                                           | A turn ended                                                        | Show a line under the answer. Cannot block a stop                                          |
| `classic.<Event>`                                                         | Each of the 33 settings events, with or without a settings hook     | The answers of that settings hook                                                          |

The other events cover the prompt box, slash commands, `/config`, the UI, and the `$` calls of other plugins (64 op events, such as `fs.read` or `process.run`). A mod can answer an op event in place of the call.

**What only a mod can do:** answer a tool call without the tool, rewrite the system prompt or a stored transcript row, replace compaction, change the model for each request, gate `@` reads, and keep state in process. **What only a settings hook can do:** decide with no code (`http`, `prompt`, `agent`, `mcp_tool`), run in the background with `async`, and run when no mod can load. Mods do not load with `disableAllHooks`, `allowManagedHooksOnly`, safe mode, `--bare`, an untrusted workspace, or a diskless cloud session.

**`cc-plugin-sec-default`.** For a Team or Enterprise organization, or a machine with managed settings, this built-in plugin sits outermost. For a user mod, it always skips `classic.*`, `prompt.section`, `prompt.context`, `prompt.attachment`, `prompt.compose`, `skill.prompt`, `attribution.text`, `session.compact`, `settings.read`, and some `session.append` rows. It does not skip `tool.call`, `prompt.submit`, or `session.start`.

**Failure.** A mod hook that throws, returns a wrong shape, or uses more than 10 s of its own time is skipped, and the hooks beneath it decide. A `.catch` runs only when the hook throws or times out, and it can refuse in the hook's place within 1 s. An action that a hook can block is refused when the worker cannot reach the hook.

## pi and omp

pi 1.3.0 has 41 events. omp 18.12.2 has 50 events: 27 of the pi events and 23 of its own. "Obs" means the return value is ignored.

| Event                                     | Fires                                                | pi 1.3.0                                    | omp 18.12.2                                                                           |
| ----------------------------------------- | ---------------------------------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------- |
| `project_trust`                           | Before project extensions load                       | Decide trust                                | No                                                                                    |
| `session_start`                           | Startup, reload, new, resume, fork                   | Obs                                         | Obs, first load only                                                                  |
| `resources_discover`                      | After `session_start`                                | Add skill, prompt, and theme paths          | Same                                                                                  |
| `session_info_changed`                    | The session name changes                             | Obs                                         | No                                                                                    |
| `mcp_servers_change`                      | An extension adds or removes an MCP server           | Obs                                         | No                                                                                    |
| `input`                                   | User input, before expansion                         | Transform, or handle it                     | Same, other result shape                                                              |
| `user_bash`                               | The user runs `!` or `!!`                            | Replace the backend or the result           | Replace the result                                                                    |
| `before_agent_start`                      | Before a run                                         | Add a message, replace the system prompt    | Same                                                                                  |
| `agent_start`, `turn_start`               | A run or a turn begins                               | Obs                                         | Obs                                                                                   |
| `context`                                 | Before each model call                               | Replace the message list                    | Same                                                                                  |
| `context_with_system`                     | After `context`, with system messages                | Replace the message list                    | No                                                                                    |
| `cache_warming_decision`                  | Before a prompt-cache refresh                        | Warm or stop                                | Same                                                                                  |
| `before_provider_headers`                 | HTTP headers are assembled                           | Change headers in place                     | No                                                                                    |
| `before_provider_request`                 | The provider payload is built                        | Replace the payload                         | Same                                                                                  |
| `after_provider_response`                 | A response arrives                                   | Obs                                         | Obs                                                                                   |
| `provider_stream_event`                   | Each provider stream event                           | Obs, awaited                                | No                                                                                    |
| `message_start`, `message_update`         | A message starts, a streaming delta                  | Obs                                         | Obs                                                                                   |
| `message_end`                             | A message is final                                   | Replace the message                         | Obs. Use `assistant_message`                                                          |
| `tool_execution_start`, `_update`, `_end` | A tool runs                                          | Obs                                         | Obs                                                                                   |
| `tool_call`                               | Before a tool runs                                   | Block, terminate, change the input in place | Block, replace the input, add context                                                 |
| `tool_result`                             | A tool finished                                      | Rewrite content, details, error flag        | Same, plus add context                                                                |
| `turn_end`                                | A turn ends                                          | Add entries, continue the run               | Obs                                                                                   |
| `agent_end`                               | A run's loop ends. A retry or compaction can follow. | Obs, awaited                                | Obs, **not awaited**. Has `willContinue`                                              |
| `agent_before_settle`                     | Before the final settle                              | Add entries, continue the run               | No                                                                                    |
| `agent_settled`                           | pi will not continue on its own                      | Obs                                         | No                                                                                    |
| `ui_prompt_start`, `ui_prompt_end`        | An extension dialog opens or closes                  | Obs                                         | No                                                                                    |
| `model_select`, `thinking_level_select`   | The model or thinking level changes                  | Obs                                         | No                                                                                    |
| `session_before_compact`                  | Before compaction                                    | Cancel, or supply the summary               | Same                                                                                  |
| `session_compact`                         | Compaction succeeded                                 | Obs                                         | Obs                                                                                   |
| `session_compact_failed`                  | Compaction failed                                    | Obs                                         | No                                                                                    |
| `session_before_switch`                   | Before `/new` or `/resume`                           | Cancel                                      | Same                                                                                  |
| `session_before_fork`                     | Before `/fork` or `/clone`                           | Cancel                                      | No. omp has `session_before_branch`                                                   |
| `session_before_tree`, `session_tree`     | Tree navigation                                      | Cancel, supply the summary; obs             | Cancel, summary; obs                                                                  |
| `session_shutdown`                        | Before teardown                                      | Obs                                         | Obs, 2 s for each handler                                                             |
| `session_stop` (omp only)                 | The main agent is about to settle. Not in subagents. |                                             | Continue with context, or block with a reason. At most 8 continuations unless blocked |
| `assistant_message` (omp only)            | An assistant message is final                        |                                             | Rewrite text blocks                                                                   |
| `before_subagent_spawn` (omp only)        | Before a subagent picks its model                    |                                             | Change the model, block                                                               |
| `session.compacting` (omp only)           | Before the summary prompt is built                   |                                             | Change context, prompt, and kept data                                                 |
| `user_python` (omp only)                  | The user runs `$` or `$$`                            |                                             | Replace the result                                                                    |

omp has 17 more events of its own that are observe-only: session switch and branch, auto compaction, retry, approval, plan review, and similar.

Notes that affect a shared extension:

- **`continue` needs a message to continue from.** In pi, `agent_before_settle` or `turn_end` with `continue: true` after a plain assistant reply is rejected ("requested continuation without runnable model context"). Return a `custom_message` entry with it.
- **`pi.sendMessage` with `triggerTurn`** during a run, also from `agent_end`, steers the message into the run, and the run continues. When idle, it starts a new run. omp steers while a run streams, whatever `triggerTurn` says. What it does from omp's `agent_end`, which omp does not await, is not confirmed from source.
- **omp accepts any event name.** `pi.on("agent_before_settle", …)` registers in omp with no error and never fires.
- **A handler that throws.** In pi, a throw in `tool_call` blocks the tool, a throw in `user_bash` stops the command, and a throw elsewhere is reported and its result dropped. pi has no handler timeout. In omp, each handler has 30 s (`session_shutdown`: 2 s). A throw or timeout in `tool_call` blocks the tool, but a throw in `user_bash` or `user_python` lets the command run.
- **omp edit paths.** An omp `edit` result sets `paths` in hashline mode, and `path` in replace and patch mode, also in hashline mode when one file changed.
- **`ctx.ui.notify`** reaches the user only. In pi's print and JSON modes, it does nothing.

## Codex

12 events. Codex runs command hooks only. Only a handler without `async: true` can control anything. An exit code other than 0 or 2 is a failed hook with no effect.

| Event               | Fires                                                  | Matcher                                         | Control                                                                                           |
| ------------------- | ------------------------------------------------------ | ----------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `SessionStart`      | The first turn, and after a successful compaction      | `startup`, `resume`, `clear`, `compact`, `fork` | Add context, stop, `systemMessage`                                                                |
| `UserPromptSubmit`  | Each user input                                        | none                                            | Block, stop, add context                                                                          |
| `PreToolUse`        | Before a tool runs. In subagents too, with `agent_id`. | Tool name and its aliases                       | Exit 2 or `deny` with a reason blocks. `allow` with `updatedInput` changes the input. Add context |
| `PermissionRequest` | An approval prompt would show                          | Tool name                                       | Allow or deny                                                                                     |
| `PostToolUse`       | After a tool returns a successful result               | Tool name and its aliases                       | Exit 2 or `decision: block` replaces the result with the reason. Add context                      |
| `Stop`              | The turn would end                                     | none                                            | Exit 2 or `decision: block` sends the reason as a new prompt and sets `stop_hook_active`          |
| `SubagentStart`     | A subagent starts                                      | Agent type                                      | Add context                                                                                       |
| `SubagentStop`      | In place of `Stop`, in a subagent                      | Agent type                                      | Same as `Stop`                                                                                    |
| `PreCompact`        | Before compaction                                      | `manual`, `auto`                                | Cancel the compaction and the turn                                                                |
| `PostCompact`       | After a successful compaction                          | `manual`, `auto`                                | End the turn                                                                                      |
| `SessionEnd`        | Shutdown, root session only                            | none                                            | None                                                                                              |
| `Interrupt`         | The user interrupts a turn, root session only          | none                                            | `systemMessage`                                                                                   |

Codex has no `PostToolUseFailure`. It does not need one for a shell command: a command that exits with a non-zero code is a successful tool result, so `PostToolUse` fires (`tools/registry.rs`, `tools/context.rs:409`). It does not fire when the process cannot start, when the call is cancelled, or for a failed `apply_patch`. A command that is still running when `exec_command` returns gets its `PostToolUse` later, from the `write_stdin` call that sees it end.

Tool names in `tool_name`: `Bash` (shell commands), `apply_patch` (the matchers `Write` and `Edit` also select it), `spawn_agent` (alias `Agent`), `mcp__<server>__<tool>`, and the plain name of each other tool. When the model sends `apply_patch` as a shell command, Codex runs the patch itself: a `Bash` `PreToolUse` fires, and no `PostToolUse` fires.

## Comparison

Claude Code mods and pi extensions both reach into the model's input: a mod can rewrite the system prompt, the stored transcript, compaction, and each model request. Only pi reaches the raw provider headers and stream. omp has a stop event and control of the subagent model. Only Claude Code settings hooks decide with no code.

| Need                                              | Claude Code    | pi            | omp                 | Codex                              |
| ------------------------------------------------- | -------------- | ------------- | ------------------- | ---------------------------------- |
| Block a tool call                                 | Yes            | Yes           | Yes                 | Yes                                |
| Change a tool's input                             | Yes            | Yes, in place | Yes                 | Yes                                |
| Feedback after a tool, also after a failure       | Yes            | Yes           | Yes                 | Yes, except a failed `apply_patch` |
| Keep the agent working at a stop                  | Yes            | Yes           | Yes, `session_stop` | Yes                                |
| A stop in a subagent                              | `SubagentStop` | No            | No                  | `SubagentStop`                     |
| Rewrite the system prompt or messages             | Mod            | Yes           | Yes                 | No                                 |
| Decide with no code                               | Settings hooks | No            | No                  | No                                 |
| React to a file change on disk or a config change | Yes            | No            | No                  | No                                 |

A hook that needs a row with a "No" cannot share one core across all 4 agents.

## What this means here

The hooks here attach to 4 points: before a tool call, after a tool call, the stop, and the session start. Every agent has all 4.

| Hook                                                              | Claude Code                                                      | pi and omp                                  | Codex                                                           | Scoping                           |
| ----------------------------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------- | --------------------------------------------------------------- | --------------------------------- |
| `enforce-cli-tools`, `block-commit-attribution`                   | Mod `tool.call` Bash, before `next`                              | `tool_call` bash                            | `PreToolUse` Bash (enforce only)                                | Correct                           |
| `block-secret-commits`                                            | `PreToolUse` Bash, command hook                                  | `tool_call` bash                            | `PreToolUse` Bash                                               | Correct                           |
| `format-all-languages`, `format-org-tables`, `lint-all-languages` | Mod `tool.call` Write, Edit, Bash, after `next`                  | `tool_result` write, edit, bash             | `PostToolUse` Bash, `apply_patch`                               | Gaps in omp and Codex, see below  |
| `lint-prose`                                                      | Mod `tool.call` Write, Edit, after `next`                        | `tool_result` write, edit                   | `PostToolUse` `apply_patch`                                     | Gaps in omp and Codex, see below  |
| `type-check-all-languages`                                        | `Stop`, command hook                                             | `agent_end` with `sendMessage`              | `Stop`                                                          | omp has a better event, see below |
| `track-session-changes`                                           | Mod `tool.call` Bash, Write, Edit, NotebookEdit; `session.start` | `tool_call`, `tool_result`, `session_start` | `PreToolUse`, `PostToolUse` Bash, `apply_patch`; `SessionStart` | Gaps in omp and Codex, see below  |

The choice of event in Claude Code is correct. `cc-plugin-sec-default` skips `classic.*` but not `tool.call` or `session.start`, and the two hooks on `classic.*`-type events run as command hooks. `tool.call` fires in subagents and before the permission prompt, so a Bash guard denies before you see a prompt. [`event-scoping.md`](event-scoping.md) holds: a per-file check after each tool call, a whole-project check at the stop.

Findings:

1. **omp: `type-check-all-languages` should use `session_stop`.** Tested live on omp 18.12.2 in `omp -p`, with a check that takes 5 s:
   - The hook's `agent_end` handler lost the run. omp does not await it, so omp printed its answer and exited before `sendMessage`.
   - A `session_stop` handler continued the run once, and passed on the second stop with `stop_hook_active: true`.
   - With a check that ends at once, both methods worked.

   In pi, `agent_end` is correct, because pi awaits it and the steered message continues the run.

2. **omp: `ast_edit` and `eval` change files that no hook sees.** Tested live on omp 18.12.2 with the real hooks, in a git repo. `ast_edit` renamed a function in a Python file with an unused import, and `eval` wrote a new Python file. No lint feedback reached the model, although `lint-all-languages` blocks on that file when it gets a Write payload, and `track-session-changes` logged nothing. pi has no such tools.
   - omp sends many tools through `write`: the model writes the tool arguments to a virtual path such as `xd://ast_edit`, `xd://lsp`, or `xd://resolve`. A nested `tool_call` and `tool_result` with the real tool name follow. So the hooks that match `write` also get these paths. They ignore them, because no such file exists.
   - `ast_edit` makes a preview only (`applied: false`). The files change at the later `write` to `xd://resolve`, whose `details.xdev.inner` has `sourceToolName: "ast_edit"` and the list of files.
   - `eval` runs Python or JavaScript code, and its input names no files, as a `bash` command does.
3. **Codex: an `apply_patch` sent as a shell command skips the file hooks.** Not seen in use. The 21 Codex sessions in `~/.codex/sessions` have 113 tool calls, all through `exec` (code mode), with 16 nested `apply_patch` calls and 100 shell calls. No shell call sends a patch. Hooks fire for the nested calls: the lint output of a nested `apply_patch` reached the model.
4. **Claude Code: the formatters and linters skip `NotebookEdit`.** Only `track-session-changes` matches it. Prettier does not format `.ipynb` files, and ruff can lint them. This gap is small.
5. **All agents: MCP tools that write files are not matched.** No MCP server here writes project files.

Tests run on 2026-10-19.
