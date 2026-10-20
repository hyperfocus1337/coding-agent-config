# Implementation notes

Why the hook runs after each tool call, and which other events were considered and rejected. [README.md](../README.md) describes the behaviour for a user of the hook; this file is for a person changing it.

| Agent       | Wiring                                                                               |
| ----------- | ------------------------------------------------------------------------------------ |
| Claude Code | `hooks/register.ts`, a mod on `tool.call` for Write, Edit, and Bash, after `next`    |
| pi, omp     | `pi.ts` on `tool_result`; omp also loads `omp.ts` for the omp calls                  |
| Codex       | `command.ts` on `PostToolUse`, and through `dot_codex/hooks/apply-patch.ts` on edits |

The hook moved from `hook.sh` to TypeScript on 2026-10-19. The measurements below were made on 2026-09-19 with `hook.sh` and Claude Code 2.1.278. The arguments still hold.

## Why after each call, and not Stop

[`type-check-all-languages`](../../type-check-tsc/README.md) (now `type-check-tsc` and `type-check-pyrefly`) moved from `PostToolUse` to `Stop` because it is loud and project-wide: it reran the whole project after every edit and reprinted the same unrelated errors each time. That argument does not carry over to this hook, for two reasons.

**It costs almost no context.** The hook writes nothing for the model, except the amend hint. That hint comes only when one Bash call both writes and commits a Markdown file. 40 calls in one turn cost 40 Prettier runs and close to zero context.

**It has to run per edit, not per turn.** The model reads a file back after it writes it. If formatting waits until the turn ends, the model works all turn against content that does not match what lands on disk, and the table alignment it wants while editing a table never happens while it is editing the table.

One argument does favour deferring: formatting a file directly after a Write makes the model's cached view of that file stale, which produces a "changed on disk" notice and can make a following `Edit` miss on `old_string`. Under `--prose-wrap preserve` the rewrites are small, so a miss needs the model to target the exact line Prettier touched. Seeing formatted content while working is worth more than avoiding that.

A turn end has no tool call, so `format` would get neither a file path nor a command. A `Stop` wiring needs new code, not only a new entry.

## The gap that format-staged-files closes

The Bash sweep is Markdown-only on purpose, for the reason the README gives under [Bash (markdown sweep)](../README.md#bash-markdown-sweep): reformatting every changed `.ts`, `.css`, and `.json` on every shell command would fight edits still in progress.

The cost of that choice is that a non-Markdown file written by a shell heredoc, by `jq`, or by a script stays unformatted until an `Edit` touches it. It is a real case, not a hypothetical one: a `jq ... | sponge dot_claude/settings.json` edit in this repo is exactly it. Such a file only hurts when it reaches a commit, and until then the next `Edit` fixes it for free.

The [`format-staged-files`](../../../../dot_config/git/hooks/format-staged-files/README.md) git hook closes the gap. In an agent session it runs `command.ts` on each staged file before git writes the commit, with the full extension set. This also covers the case that a check before the Bash call cannot: in `cat > README.md <<'EOF' ... && git commit -am docs`, the file exists only after the call starts. The amend hint stays for a commit that skips the git hook, such as `git commit --no-verify`.

## Why a failed Bash call is formatted too

A `PostToolUse` command hook fires only after a tool call succeeds. A Bash command that exits non-zero raises `PostToolUseFailure`, a separate event.

Measured on 2026-09-19. Two Bash calls wrote the same unaligned table to a literal path and differed only in the exit code. The exit 0 file came back column-aligned; the exit 1 file was untouched. The gap covers the write-then-verify shape, which is most of what a shell command does here: the file is written, a later step in the chain fails, and the formatting never ran on the file that is about to be edited again.

The mod on `tool.call` gets the result of each call after `next`, a failed one too, so Claude Code needs no second entry. A half-written file from an interrupted command is still a file worth formatting, and a Prettier failure on one is ignored.

`command.ts` still echoes `hook_event_name` back as `hookEventName`, because `hookSpecificOutput` must name the event that fired, or the output is invalid.

## Events that do not apply

`SessionEnd` is wrong for any hook whose result the model must act on. Its output goes to `process.stderr` during shutdown, so no model turn ever reads it, and it runs under a 1500 ms default bound that a per-hook `timeout` raises only to a 60 s cap. For a formatter the first half does not matter, because the hook says nothing anyway, but the time bound does: a sweep cut off halfway leaves some files formatted and some not.

`PostToolBatch` fires once after a batch of parallel tool calls resolves, so it would merge several sweeps into one. The sweep is already cheap and idempotent, so this buys speed, not correctness.

An `async: true` command hook would move the sweep off the critical path. It is the wrong trade here: the hook would then rewrite files while the model is already reading them.
