# Hook events in Claude Code and pi

Which lifecycle points each agent lets you attach code to, what each point can change, and which of the two is more flexible.

Read from source on 2026-09-19: Claude Code 2.1.278 (`~/.local/share/claude/versions/2.1.278`) and pi 0.85.1 (`@earendil-works/pi-coding-agent`, `docs/extensions.md` plus `dist/core/extensions/types.d.ts`). The pi-code column is pi-code 1.0.64, the current npm `latest`. Nothing on this page is measured by execution. For how pi-code compares with this repo's own adapter, see [`pi-code.md`](pi-code.md).

## The two mechanisms are not the same shape

A Claude Code hook is a JSON entry in `settings.json`. The agent fires it with the event as JSON on stdin and reads a decision back from the exit code and stdout. You write no program code, and the hook runs out of process.

A pi hook is a TypeScript module in `~/.pi/agent/extensions/`. The agent calls `pi.on("event", handler)` in process, passes the event object, and uses the return value. pi has no `hooks` key in `settings.json`, so every pi hook is code.

That difference decides most of the comparison below, so read the two tables against it.

## Claude Code events

33 events, from the `hooks` enum in the 2.1.278 binary. Order follows the session lifecycle. Control terms: **observe** means the return value cannot change the action, **block** stops it, **deny** answers a permission decision, **change input** rewrites the arguments, **add context** injects text the model then reads.

| Event                 | Fires                                    | Matcher                                               | Control                      |
| --------------------- | ---------------------------------------- | ----------------------------------------------------- | ---------------------------- |
| `Setup`               | On `--init-only`, or in `-p` mode        | `init`, `maintenance`                                 | Add context                  |
| `SessionStart`        | Session begins or resumes                | `startup`, `resume`, `clear`, `compact`, `fork`       | Add context                  |
| `InstructionsLoaded`  | `CLAUDE.md` or a rule file loads         | `session_start`, `path_glob_match`, `include`, ...    | Add context                  |
| `UserPromptSubmit`    | User submits a prompt                    | none                                                  | Block, add context           |
| `UserPromptExpansion` | A command expands into a prompt          | Command name                                          | Block                        |
| `PreToolUse`          | Before a tool call runs                  | Tool name                                             | Block, deny, change input    |
| `PermissionRequest`   | A tool call needs a permission decision  | Tool name                                             | Deny                         |
| `PermissionDenied`    | Auto mode denies a tool call             | Tool name                                             | Set a retry flag             |
| `PostToolUse`         | After a tool call succeeds               | Tool name                                             | Add context                  |
| `PostToolUseFailure`  | After a tool call fails                  | Tool name                                             | Add context                  |
| `PostToolBatch`       | After a batch of parallel calls resolves | none                                                  | Add context                  |
| `MessageDisplay`      | Assistant text is displayed              | none                                                  | Observe                      |
| `Notification`        | Claude Code raises a notification        | Notification type                                     | Observe                      |
| `Stop`                | Claude finishes responding               | none                                                  | Block the stop, add context  |
| `StopFailure`         | The turn ends on an API error            | Error type, such as `rate_limit`                      | Observe                      |
| `SubagentStart`       | A subagent is spawned                    | Agent type                                            | Add context                  |
| `SubagentStop`        | A subagent finishes                      | Agent type                                            | Add context                  |
| `TaskCreated`         | A task is created through `TaskCreate`   | none                                                  | Add context                  |
| `TaskCompleted`       | A task is marked complete                | none                                                  | Add context                  |
| `TeammateIdle`        | An agent-team teammate is about to idle  | none                                                  | Add context                  |
| `PreCompact`          | Before compaction                        | `manual`, `auto`                                      | Add context                  |
| `PostCompact`         | After compaction                         | `manual`, `auto`                                      | Add context                  |
| `PreModelSwitch`      | Before a model switch applies            | Model name                                            | Block                        |
| `PostModelSwitch`     | After the session model changes          | Model name                                            | Add context                  |
| `Elicitation`         | An MCP server asks the user for input    | Server name                                           | Change the response          |
| `ElicitationResult`   | After the user answers an elicitation    | Server name                                           | Change the response          |
| `ConfigChange`        | A settings or skills file changes        | `user_settings`, `project_settings`, `skills`, ...    | Add context                  |
| `CwdChanged`          | The working directory changes            | none                                                  | Add context                  |
| `DirectoryAdded`      | A directory is added mid-session         | `slash_command`, `register_repo_root`                 | Add context                  |
| `FileChanged`         | A watched file changes on disk           | Literal file names to watch                           | Add context                  |
| `WorktreeCreate`      | A worktree is created                    | none                                                  | Block, replace the behaviour |
| `WorktreeRemove`      | A worktree is removed                    | none                                                  | Block                        |
| `SessionEnd`          | The session ends                         | `clear`, `resume`, `logout`, `prompt_input_exit`, ... | Observe                      |

`SessionEnd` is the one event whose output reaches nobody. `executeSessionEndHooks` runs during shutdown and writes a failed hook's output straight to `process.stderr`, so it lands in the terminal and never in a model turn. It is also the one event on a hard clock: 1500 ms by default, raised by a per-hook `timeout` but capped at 60 s. Put a check that the model must act on somewhere else.

Every event accepts five hook types. The type decides who answers, not when the hook fires.

| Type       | What answers                           | Events                                |
| ---------- | -------------------------------------- | ------------------------------------- |
| `command`  | A shell command, event JSON on stdin   | All                                   |
| `http`     | A POST to a URL, JSON response body    | All                                   |
| `mcp_tool` | A tool on a connected MCP server       | All except `SessionStart` and `Setup` |
| `prompt`   | One model call, JSON decision          | All                                   |
| `agent`    | A subagent with `Read`, `Grep`, `Glob` | All (marked experimental)             |

A `command` hook also takes `timeout`, `statusMessage`, an exec form with `args`, and `async` or `asyncRewake` to run in the background. Every entry takes an `if` permission-rule filter. Hooks merge across managed policy, user, project, local, plugin, skill frontmatter, and agent frontmatter.

## pi events

36 events, from the `ExtensionEvent` union in `dist/core/extensions/types.d.ts`. The pi-code column names the Claude event pi-code 1.0.64 drives from that pi event.

| Event                     | Fires                                        | Control                                     | pi-code drives                      |
| ------------------------- | -------------------------------------------- | ------------------------------------------- | ----------------------------------- |
| `project_trust`           | Before pi trusts a project                   | Decide trust, and persist it                | none                                |
| `session_start`           | Session starts, loads, or reloads            | Observe                                     | `SessionStart`                      |
| `resources_discover`      | After `session_start`                        | Add skill, prompt, and theme paths          | none                                |
| `session_info_changed`    | Session name is set                          | Observe                                     | none                                |
| `input`                   | User input arrives, before expansion         | Transform it, or handle it entirely         | `UserPromptSubmit`                  |
| `user_bash`               | User runs `!` or `!!`                        | Replace the bash backend or result          | `PreToolUse` for `Bash`             |
| `before_agent_start`      | After submit, before the agent loop          | Inject a message, replace the system prompt | none                                |
| `agent_start`             | An agent run begins                          | Observe                                     | none                                |
| `turn_start`              | A turn begins                                | Observe                                     | none                                |
| `context`                 | Before each LLM call                         | Rewrite the whole message list              | none                                |
| `before_provider_headers` | Outgoing HTTP headers are assembled          | Add, override, or delete a header           | none                                |
| `before_provider_request` | The provider payload is built                | Replace the payload                         | none                                |
| `after_provider_response` | Response received, before the stream is read | Observe status and headers                  | none                                |
| `message_start`           | A message begins                             | Observe                                     | none                                |
| `message_update`          | Assistant streaming update                   | Observe                                     | none                                |
| `message_end`             | A message is finalized                       | Replace the message, same role              | none                                |
| `tool_execution_start`    | Tool preflight                               | Observe                                     | none                                |
| `tool_call`               | Before the tool runs                         | Block, terminate, mutate the input          | `PreToolUse`                        |
| `tool_execution_update`   | Partial tool output                          | Observe                                     | none                                |
| `tool_result`             | Tool finished                                | Rewrite content, details, or error          | `PostToolUse`, `PostToolUseFailure` |
| `tool_execution_end`      | After the result is finalized                | Observe                                     | none                                |
| `turn_end`                | A turn ends                                  | Observe                                     | none                                |
| `agent_end`               | An agent run ends, retries still possible    | Observe                                     | `Stop`                              |
| `agent_settled`           | pi will not continue on its own              | Observe                                     | none                                |
| `ui_prompt_start`         | An extension UI prompt opens                 | Observe                                     | none                                |
| `ui_prompt_end`           | That prompt closes                           | Observe                                     | none                                |
| `model_select`            | Model changes or is restored                 | Observe                                     | `PostModelSwitch`                   |
| `thinking_level_select`   | Thinking level changes                       | Observe                                     | none                                |
| `session_before_compact`  | Before compaction                            | Cancel it, or supply the summary            | `PreCompact`                        |
| `session_compact`         | Compaction succeeded                         | Observe                                     | `PostCompact`                       |
| `session_compact_failed`  | Compaction failed or was aborted             | Observe                                     | none                                |
| `session_before_switch`   | Before `/new` or `/resume`                   | Cancel it                                   | none                                |
| `session_before_fork`     | Before `/fork` or `/clone`                   | Cancel it                                   | none                                |
| `session_before_tree`     | Before `/tree` navigation                    | Cancel it, or supply the summary            | none                                |
| `session_tree`            | After tree navigation                        | Observe                                     | none                                |
| `session_shutdown`        | Before the session runtime is torn down      | Observe                                     | `SessionEnd`                        |

pi-code bridges 14 of Claude Code's 33 events. The four not in the table above do not ride a pi lifecycle event: `SubagentStart` and `SubagentStop` use pi-code's own subagent seam, `InstructionsLoaded` uses its instruction-events bus, and `Notification` is an idle timer pi-code arms itself, so it only ever carries `notification_type: "idle_prompt"`. `PreModelSwitch` is left unbridged on purpose, because pi has no veto seam for a model change. All five Claude hook types work under pi-code, including `http`, `prompt`, `agent`, and `mcp_tool`.

## Comparison

### Count says almost nothing

36 against 33 is a tie in practice. The two sets cover different parts of a session, so the number of events is the wrong measure. What each event can change is the right one.

### Each set covers what the other cannot reach

Claude Code has 11 events with no pi counterpart, and they cluster in two places. The permission system: `PermissionRequest` and `PermissionDenied`. The workspace and its configuration: `ConfigChange`, `CwdChanged`, `DirectoryAdded`, `FileChanged`, `WorktreeCreate`, `WorktreeRemove`. Plus the team and task surface, `TeammateIdle`, `TaskCreated`, and `TaskCompleted`. pi fires nothing when a file changes on disk, when settings change, or when a permission decision is made.

pi has 10 events with no Claude Code counterpart, and they cluster in one place: what reaches the model. `context` rewrites the message list before every call. `before_provider_headers`, `before_provider_request`, and `after_provider_response` sit on the HTTP request itself. `message_start`, `message_update`, and `message_end` sit on the message stream. `session_before_fork`, `session_before_switch`, and `session_before_tree` gate session navigation. Claude Code exposes no seam on the provider request or on the message list.

### pi gives deeper control per event

A Claude Code hook answers with JSON, so it can only say what that schema can express: block, allow, deny, `updatedInput` on `PreToolUse`, `updatedToolOutput`, and `additionalContext`. It cannot remove a message, rewrite the system prompt, or change the request body.

A pi handler is a function, so its return value replaces real objects. `context` returns a new message list. `before_agent_start` returns a new system prompt. `before_provider_request` returns a new payload. `message_end` returns a different message. `user_bash` returns a different bash backend. `input` can answer the user without calling the model at all. None of this is expressible in Claude Code's hook contract.

### Claude Code gives a wider configuration surface

pi has exactly one way to write a hook: a TypeScript module that runs in process with your full permissions. Claude Code has five, and three of them need no code you maintain. An `http` hook puts the decision on another host. A `prompt` hook makes a model the decision-maker in two lines of JSON. An `mcp_tool` hook routes it to a connected server. On top of that, Claude Code has matchers, per-hook timeouts, `if` permission filters, background execution through `async` and `asyncRewake`, and a merge order across seven configuration sources. pi has none of these, because in a TypeScript handler you write each one yourself.

### Failure behaviour differs

A Claude Code hook that times out fails open, at a 600 second default. A pi extension error is logged and the agent continues, except in `tool_call`, where an error blocks the tool. So pi fails closed exactly where it matters and open elsewhere, while Claude Code fails open and leaves the guard to the hook.

### Verdict

Neither system is more flexible across the board. They are flexible in opposite directions.

pi is more flexible per event. Its handlers reach the message list, the system prompt, the provider payload, and the finalized message, and each returns a real object rather than a decision code. If the goal is to change what the model sees or sends, pi can do things Claude Code's hook contract cannot express at all.

Claude Code is more flexible per configuration. It fires at more of the places a guardrail cares about, it can answer in five ways including three that need no code, and it layers matchers, filters, timeouts, and seven configuration sources on top. If the goal is to gate, log, or observe, and to ship that to other people, Claude Code needs less work and less maintained code.

The short rule: to rewrite what reaches the model, use pi. To gate or observe what the agent does, use Claude Code.

## What this means here

This repo runs six hook scripts, all `command` hooks, on `PreToolUse`, `PostToolUse`, `PostToolUseFailure`, and `Stop`. All four are in both sets and all four are bridged by pi-code: `PostToolUseFailure` through `tool_result`, `Stop` through `agent_end`. [`claude-compat.ts`](../../../dot_agents/extensions/claude-compat.ts) bridges `PreToolUse` and `PostToolUse` only, so under that adapter `type-check-all-languages` does not fire at all, and the two formatting hooks lose their failed-command pass. None of the differences above blocks the configuration otherwise. They decide what a future hook can do, not what today's six do.

Two entries are worth noting for that future. A `FileChanged` or `ConfigChange` hook has no pi equivalent, so it would stay Claude-only. A hook that needs to inspect or rewrite the provider request has no Claude Code equivalent, so it would have to be a pi extension rather than a shared hook.
