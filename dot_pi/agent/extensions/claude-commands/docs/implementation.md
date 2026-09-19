# Implementation notes

Why the extension is built the way it is. [README.md](../README.md) describes the behaviour for a person using the commands; this file is for a person changing the code. Written against pi 0.85.1.

## Why one `registerCommand` per file

pi has two native ways to load prompt files: the `prompts` array in `settings.json` and the `promptPaths` result of a `resources_discover` handler. Both scan a directory to any depth and both name a file by its basename alone, so `git/commit/single.md` registers as `/single`, and of two files with the same basename one silently wins. This repository has three such collisions (`git/branches/cleanup.md` against `git/worktrees/cleanup.md`, `git/push.md` against `git/commit/push.md`, and `README.md` at three levels), and it keeps the Claude names, so neither native path can carry it.

`pi.registerCommand()` takes any name, so the extension walks the tree and registers each file under its `:` path. `registerCommand` reserves `:` for the numeric suffix it adds when two extensions register one name, such as `/review:1`. A namespaced name is a single registration, so the two uses do not meet: all 51 commands register with their names intact and no suffix.

The handler reads the file at invocation, not at load, so an edit to a command file takes effect on the next call without `/reload`.

## Expansion order

Arguments are substituted first, then spans run. Three command files put `$ARGUMENTS` inside a `!` span (`gh issue view $ARGUMENTS`), which only works in this order. It is also the order Claude Code's `expandCommand` uses.

## Argument substitution

One regular expression covers every placeholder and the two escape forms, and its alternation order is load-bearing:

1. `\\` before `$`, kept as is, so a doubled backslash does not swallow the escape.
2. `\$` before a digit, `ARGUMENTS`, or a declared name, replaced by `$`, so `\$1` never expands.
3. `$ARGUMENTS[N]` before bare `$ARGUMENTS`, so the index is not read as literal brackets.
4. `$N`.
5. `$name`, from `arguments:`, on a word boundary. When a file declares no names the branch is `(?!)`, which never matches.

Claude Code's indexes are 0-based, `$0` is the first argument. An index with no argument stays literal, so `$2` with one argument reaches the model as `$2`, which is visibly wrong. A declared name with no argument expands to nothing, which is Claude's behaviour too and is why the README warns about `HEAD~$count`.

`consumed` reports whether any placeholder read the arguments. It drives the `ARGUMENTS:` line Claude appends when a command ignores what was typed. A name counts as consuming even when its position is empty, because it did expand.

The argument string is split shell-style: a double- or single-quoted run is one argument, everything else splits on whitespace. There is no escape inside quotes.

## Frontmatter without a YAML parser

Every value the command files use is a one-line scalar or a list, so `parseFile` reads `key: value` lines and, for a key with an empty value, absorbs the `- item` lines below it as a space-joined string. `arguments:` therefore arrives as one string in all three spellings Claude accepts (flow list, block list, space-separated), and `argumentNames` strips the brackets and splits. Quotes around a value are removed. The frontmatter ends at the second `---` line, so a `---` rule inside the body does not end it early. `claude-rules` imports this parser for `paths:`.

## Spans

`fencedRanges` records the character ranges of every fenced block first, and a span whose `!` falls inside one is skipped, because a command file that documents the syntax shows it inside a fence. The span pattern requires the `!` to be at the start of a line or after whitespace, so a shell assignment such as `KEY=!`cmd`` is not a span.

Each span runs through `pi.exec("/bin/sh", ["-c", script])` with `cwd` set to the session directory and Claude's 120-second budget. stderr is captured separately and merged into the output, because appending `2>&1` to the script would bind to its last command only. A non-zero exit throws, the handler catches it, and `ctx.ui.notify` shows the failure; nothing is sent to the model.

## Not carried over, in detail

`allowed-tools` in Claude Code pre-approves tools for the command's turn under its permission system. pi has no permission prompts, so the field has no effect to reproduce. `disable-model-invocation` in Claude Code hides a command from the `SlashCommand` tool the model can call. pi has no such tool, so every command here is user-invoked already, which is the safe direction. `@file` inlining, `${CLAUDE_SESSION_ID}` and the other `${CLAUDE_*}` variables, and ` ```! ` fenced dynamic blocks are unused in `dot_claude/commands/`, and adding them unused would be an abstraction with no caller.

## Probing a live session

A probe extension placed after this one in `~/.pi/agent/extensions/` can read `pi.getCommands()` at `before_agent_start`, print what it needs, and call `ctx.shutdown()`; no provider account is needed. Run it with `pi -p "hi" </dev/null`. stdin must be closed, or `session_start` never fires and the process hangs. Print mode runs one turn, so a message queued with `deliverAs: "followUp"` is never delivered in it.
