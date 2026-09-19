# Implementation notes

Why the extension injects where it does. [README.md](../README.md) describes the behaviour for a person writing rules; this file is for a person changing the code. Written against pi 0.85.1.

## Unscoped rules: `before_agent_start`

pi builds the system prompt from `systemPromptOptions` (`cwd`, `skills`, `contextFiles`, `customPrompt`, `appendSystemPrompt`, `selectedTools`, `toolSnippets`, `promptGuidelines`), and that object is read-only input to the `before_agent_start` handler. The only way to add text is to return `{ systemPrompt }`, which replaces the prompt and chains across handlers in load order. So the extension appends its block to `event.systemPrompt` and returns it.

Every change to the system prompt invalidates the prompt cache, so the block is computed once at load, from `discover()`, and the handler returns the same string each turn. Rule files are read at load, not per turn; `/reload` picks up an edit.

## Scoped rules: `tool_result` plus `sendMessage`

Claude Code delivers a scoped rule after it reads a matching file. The extension watches `tool_result` for the `read`, `write`, and `edit` tools, which carry the file in `event.input.path`, resolves it against `ctx.cwd`, and matches the relative path. A tool result with `isError` is skipped.

Delivery is `pi.sendMessage({ customType: "claude-rule", ... }, { deliverAs: "steer" })`. A steer message is inserted before the next model call, which is the same point the `context` event offers, and a custom message persists in the session as a `custom_message` entry. That persistence is what makes "once per session" cheap: at `session_start` the extension walks `ctx.sessionManager.getBranch()` and rebuilds the set of sent rule names from the entries with that `customType`, so a resume, a fork, or `/new` starts from what the current branch already carries. The `context` event would need the extension to keep a queue between the tool result and the next call instead. `display: false` keeps the message out of the transcript view; `ctx.ui.notify` shows one line instead.

The message body names the rule and the file that triggered it, then the rule text.

## Globs: `path.matchesGlob`

Claude Code documents its glob semantics as a table: `*` stays inside a path segment, `**` crosses directories, braces expand, and a pattern with no slash matches the project root only. Node's `path.matchesGlob` gives exactly that table, so there is no glob dependency. `test/check.ts` asserts every row, so a change that departs from Claude's table fails there first. Two cases are handled before matching: a pattern with a trailing slash gets `**` appended, and a relative path that starts with `..` or is absolute returns false, so a file outside the project never matches.

## Frontmatter

`paths:` is read through `parseFile` from `claude-commands`, which joins a block list with spaces and keeps a flow list as written. `patterns()` strips brackets and quotes and splits on commas and whitespace, so `- "dot_claude/**"` lines and `["dot_claude/**", "dot_config/**"]` produce the same list.

## Probing a live session

A probe extension placed after this one in `~/.pi/agent/extensions/` sees the appended block in `event.systemPrompt` at `before_agent_start`; one placed before it, or loaded with `-e`, runs first and sees the prompt without the block. To see a scoped rule fire, the probe needs a model call that reads a matching file, so it takes a provider or a stub that returns a canned `read` tool call; the rule then appears as `user -> assistant -> toolResult -> custom(claude-rule)` in the message list of the second call. Print mode runs one turn, so block stability across turns is checked across two `pi -p` processes, or by the fact that the block is a constant.
