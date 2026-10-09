# Implementation notes

Why the extension injects where it does. [README.md](../README.md) describes the behaviour for a person writing rules; this file is for a person changing the code. The structured instruction-file integration is checked against pi 1.1.0.

## Unscoped rules: `before_agent_start`

Pi 1.1 exposes mutable, normalized `event.systemPromptOptions` to `before_agent_start`. The handler adds unscoped rules to `contextFiles` as `{ path, content }` records and returns no prompt override. Pi rebuilds the prompt from those options, renders each file under `<project_context>` as `<project_instructions path="...">`, and preserves the structured section in the transcript. This also supplies the records that `pi-context-view` classifies as Instruction Files.

The handler preserves existing files and skips paths already present. It no longer returns `{ systemPrompt }`, which would force an opaque prompt and hide the files' structure. An unrelated extension that forces a full prompt can still override native structured rendering.

Instruction-file records are computed at `session_start`, from `discover()`, and retain the same paths and bodies across turns. Rule files are not read per turn; `/reload` picks up an edit. The `claude-project` event supplies the approved local directory and also rebuilds the records, so either extension load order works. Without the coordinator, only user rules load. Commands and skills can be disabled without changing rule approval.

## Scoped rules: `tool_result` plus `sendMessage`

Claude Code delivers a scoped rule after it reads a matching file. The extension watches `tool_result` for the `read`, `write`, and `edit` tools, which carry the file in `event.input.path`, resolves it against `ctx.cwd`, and matches the relative path. A tool result with `isError` is skipped.

Delivery is `pi.sendMessage({ customType: "claude-rule", ... }, { deliverAs: "steer" })`. A steer message is inserted before the next model call, which is the same point the `context` event offers, and a custom message persists in the session as a `custom_message` entry. That persistence is what makes "once per session" cheap: at `session_start` the extension walks `ctx.sessionManager.getBranch()` and rebuilds the set of sent rule identities from the entries with that `customType`, so a resume, a fork, or `/new` starts from what the current branch already carries. The `context` event would need the extension to keep a queue between the tool result and the next call instead. `display: false` keeps the message out of the transcript view; `ctx.ui.notify` shows one line instead.

The message body names the rule and the file that triggered it, then the rule text. User identities remain relative names for compatibility with existing sessions. Project identities are absolute rule paths, so equal filenames in the two scopes do not suppress each other.

## Globs: `path.matchesGlob`

Claude Code documents its glob semantics as a table: `*` stays inside a path segment, `**` crosses directories, braces expand, and a pattern with no slash matches the project root only. Node's `path.matchesGlob` gives exactly that table, so there is no glob dependency. `test/check.ts` asserts every row, so a change that departs from Claude's table fails there first. Two cases are handled before matching: a pattern with a trailing slash gets `**` appended, and a relative path that starts with `..` or is absolute returns false, so a file outside the project never matches.

## Frontmatter

`paths:` is read through `parseFile` from `claude-commands`, which joins a block list with spaces and keeps a flow list as written. `patterns()` strips brackets and quotes and splits on commas and whitespace, so `- "dot_claude/**"` lines and `["dot_claude/**", "dot_config/**"]` produce the same list.

## Probing a live session

A probe extension placed after this one sees the rule records in `event.systemPromptOptions.contextFiles` and their native wrappers in `event.systemPrompt` at `before_agent_start`. A probe that runs before it does not yet see the added records. To see a scoped rule fire, the probe needs a model call that reads a matching file, so it takes a provider or a stub that returns a canned `read` tool call; the rule then appears as `user -> assistant -> toolResult -> custom(claude-rule)` in the message list of the second call. The self-checks verify stable records, native prompt rendering, and the installed context viewer's classification without a model call.
