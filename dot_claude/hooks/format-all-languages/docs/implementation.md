# Implementation notes

Why the hook is wired to the events it is wired to, and which other events were considered and rejected. [README.md](../README.md) describes the behaviour for a user of the hook; this file is for a person changing it.

Read from the Claude Code 2.1.278 binary and from the hook itself on 2026-09-19. The Stop-payload behaviour below was run, not reasoned about; the rest is a design argument, not a measurement.

## Why PostToolUse, and not Stop

[`type-check-all-languages`](../../type-check-all-languages/README.md) moved from `PostToolUse` to `Stop` because it is loud and project-wide: it reran the whole project after every edit and reprinted the same unrelated errors each time. That argument does not carry over to this hook, for two reasons.

**It costs almost no context.** The hook always exits 0 and writes nothing to stderr. The only thing it ever adds to the context window is the amend hint, and that fires only when one Bash call both writes and commits a markdown file. Running it 40 times in one turn costs 40 Prettier invocations and close to zero context.

**It has to run per edit, not per turn.** Claude reads a file back after it writes it. If formatting waits until the turn ends, Claude works all turn against content that does not match what lands on disk, and the table alignment it wants while editing a table never happens while it is editing the table.

One argument does favour deferring: formatting a file directly after a Write makes Claude's cached view of that file stale, which produces a "changed on disk" notice and can make a following `Edit` miss on `old_string`. Under `--prose-wrap preserve` the rewrites are small, so a miss needs Claude to target the exact line Prettier touched. Seeing formatted content while working is worth more than avoiding that.

## Wiring it to Stop as-is does nothing

Worth knowing before anyone tries it. The script branches on whether `tool_input.file_path` is present. A `Stop` payload has neither `tool_input.file_path` nor `tool_input.command`, so the hook takes the Bash branch, reads `.cwd`, finds no command text, and sweeps the session repo with `ext_filter='md|markdown'`.

Measured with a Stop-shaped payload on 2026-09-19: exit 0, and no work beyond a markdown sweep the Bash matcher already performs. A third wiring on `Stop` would pay for a duplicate pass and close no gap. Closing the gap below needs a change to the script, not only to `settings.json`.

## The gap the current wiring leaves

The Bash sweep is markdown-only on purpose, for the reason the README gives under [Bash (markdown sweep)](../README.md#bash-markdown-sweep): reformatting every changed `.ts`, `.css`, and `.json` on every shell command would fight edits still in progress.

The cost of that choice is that a non-markdown file written by a shell heredoc, by `jq`, or by a script stays unformatted until an `Edit` touches it. It is a real case, not a hypothetical one: a `jq ... | sponge dot_claude/settings.json` edit in this repo is exactly it, and it stayed Prettier-clean only because jq's two-space output happens to match Prettier's.

An unformatted file of this kind only hurts when it reaches a commit. Until then the next `Edit` fixes it for free.

## The option that would close it

A third wiring, `PreToolUse` on the Bash matcher, matching the same `git commit` string the script already looks for, formatting the changed files with the full extension set before the commit is made. It would also delete code: the cksum-before, the `HEAD~1` diff, and the `additionalContext` block in the "Report a commit that needs amending" section all exist because the hook sees the commit only after the fact.

It does not close the whole case. At `PreToolUse` the heredoc in `cat > README.md <<'EOF' ... && git commit -am docs` has not run yet, so there is nothing to format and the amend hint still has to catch that one afterwards. See [Write and commit in one command](../README.md#write-and-commit-in-one-command).

Not built. The payoff is one narrow case against a second wiring and a second code path, so it waits for a stale non-markdown commit to actually cause a problem.

## Why PostToolUseFailure is wired too

`PostToolUse` fires only after a tool call succeeds. A Bash command that exits non-zero raises `PostToolUseFailure`, a separate event that needs its own entry in `settings.json`.

Measured on 2026-09-19. Two Bash calls wrote the same unaligned table to a literal path and differed only in the exit code. The exit 0 file came back column-aligned; the exit 1 file was untouched. The gap covers the write-then-verify shape, which is most of what a shell command does here: the file is written, a later step in the chain fails, and the formatting never ran on the file that is about to be edited again.

The fix was wiring, not logic. The failure payload carries `tool_name`, `tool_input`, and `error`, so `tool_input.command` is present and the sweep is identical on both events. Only the amend hint needed a change: `hookEventName` is the discriminant of a per-event `hookSpecificOutput` schema, so a hardcoded `PostToolUse` literal sent from a failure run does not validate. The hook reads `.hook_event_name` and echoes it back.

The event also carries `is_interrupt`, so the sweep now runs after an interrupted shell command. A half-written file is still a file worth formatting, and Prettier failing on one is already swallowed.

The `Write|Edit|MultiEdit` matcher is deliberately not wired to the failure event: a failed edit wrote nothing.

## Events that do not apply

`SessionEnd` is wrong for any hook whose result the model must act on. Its output goes to `process.stderr` during shutdown, so no model turn ever reads it, and it runs under a 1500 ms default bound that a per-hook `timeout` raises only to a 60 s cap. For a formatter the first half does not matter, because the hook says nothing anyway, but the time bound does: a sweep cut off halfway leaves some files formatted and some not.

`PostToolBatch` fires once after a batch of parallel tool calls resolves, so it would merge several sweeps into one. The sweep is already cheap and idempotent, so this buys speed, not correctness.

`async: true` on the existing Bash matcher would move the sweep off the critical path. It is the wrong trade here: the hook would then rewrite files while Claude is already reading them.
