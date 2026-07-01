# Claude Rules

Rules in this directory are loaded into context every session, or when Claude reads a file matching the rule's `paths:` glob. Each file has a YAML frontmatter block with a `paths:` list.

## Key principles

**Rules vs skills** — Rules load automatically (every session or on file match). Use them for standing instructions that should always apply: tool preferences, coding conventions, naming rules. For multi-step workflows or procedures that don't need to sit in context all the time, use skills instead — they only load when you invoke them or when Claude determines they're relevant to your prompt.

**Keep CLAUDE.md thin** — Target the root file at under 200 lines. Longer files consume more context and reduce adherence. Use it as a lean index that points here, plus the highest-value always-on instructions: exact build/test commands, repo layout, hard "always do X" rules. Everything topic-specific moves to `.claude/rules/` with path scoping where possible.

**Path scoping** — The `paths:` frontmatter field takes a list of globs. Rules without a `paths:` field (or with `"**"`) load unconditionally. Scope rules to reduce noise: a TypeScript style guide has no business loading when editing a shell script.

**User-level rules** — Rules in `~/.claude/rules/` apply to every project on your machine. Use them for cross-project preferences (editor habits, global tool preferences). Project-level rules in `.claude/rules/` override or extend them per-repo.

## Sources

- [Claude Code memory docs — path-scoped rules](https://code.claude.com/docs/en/memory)
- [Claude Code directory docs — scope rules to directories with paths](https://code.claude.com/docs/en/claude-directory)
