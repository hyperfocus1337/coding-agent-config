---
paths:
  - "**/rules/*.md"
---

# Claude rules

Claude Code discovers every `*.md` file in this directory on its own. Do not import them from `CLAUDE.md` with `@`. An `@` import loads the file unconditionally and bypasses its `paths:` frontmatter, which defeats the scoping.

The frontmatter decides when a rule loads:

- No `paths:` field: the rule loads at session start, like `CLAUDE.md`.
- A `paths:` list of globs: the rule loads when Claude reads a file that matches one of them.

## Key principles

**Rules vs skills**: Rules load automatically. Use them for standing instructions that always apply: tool preferences, coding conventions, naming rules. For a multi-step procedure that does not need to sit in context, write a skill instead. A skill loads when you invoke it or when Claude judges it relevant to the prompt.

**Keep CLAUDE.md thin**: Target the root file at under 200 lines. Longer files consume more context and reduce adherence. Keep only always-on instructions there: exact build and test commands, repo layout, hard "always do X" rules. Everything topic-specific belongs in this directory.

**What to scope**: Path scoping fits a rule about how to edit a file type. A TypeScript style guide has no reason to load when you edit a shell script.

**What not to scope**: Path scoping fits badly for a rule about how to act during a session. A gated rule loads only after a matching file enters context, so it arrives too late for the decisions that come first: which search tool to run, which documentation to fetch before generating code, how to word a commit message. Leave that kind of rule unscoped and pay the tokens.

**User-level rules**: Rules in `~/.claude/rules/` apply to every project on your machine. Use them for cross-project preferences. Project rules in `.claude/rules/` extend them per repo.

## Sources

- [Claude Code memory docs, path-scoped rules](https://code.claude.com/docs/en/memory)
- [Claude Code directory docs, scope rules to directories with paths](https://code.claude.com/docs/en/claude-directory)
