# Claude rules

Claude Code discovers every `*.md` file in this directory on its own. Do not import them from `CLAUDE.md` with `@`. An `@` import loads the file unconditionally and bypasses its `paths:` frontmatter, which defeats the scoping.

The frontmatter decides when a rule loads:

- No `paths:` field: the rule loads at session start, like `CLAUDE.md`.
- A `paths:` list of globs: the rule loads when Claude reads a file that matches one of them.

## Key principles

**State the decision, not the detail**: A rule names the choice the agent must take and stops there. Leave out anything the agent can read off a tool schema, a `--help` output, or a skill it already has. `rules/tools.md` says to navigate code with LSP; it does not list the LSP methods.

**Rules vs skills**: Rules load automatically. Use them for standing instructions that always apply: tool preferences, coding conventions, naming rules. For a multi-step procedure that does not need to sit in context, write a skill instead. A skill loads when you invoke it or when Claude judges it relevant to the prompt.

**Keep CLAUDE.md thin**: Target the root file at under 200 lines. Longer files consume more context and reduce adherence. `CLAUDE.md` is an index. The standing instructions live in this directory.

**What to scope**: Path scoping fits a rule about how to edit a file type. A TypeScript style guide has no reason to load when you edit a shell script.

**What not to scope**: Path scoping fits badly for a rule about how to act during a session. A gated rule loads only after a matching file enters context, so it arrives too late for the decisions these rules govern: which search tool to run, which documentation to fetch before generating code, how to word a commit message. Leave that kind of rule unscoped and pay the tokens.

**Link only to paths that exist at runtime**: A rule runs in whatever repository the agent is working in. Link to `~/.claude/`, never to this repository's `docs/`, which `.chezmoiignore` keeps out of `$HOME`.

## Sources

- [Claude Code memory docs, path-scoped rules](https://code.claude.com/docs/en/memory)
- [Claude Code directory docs, scope rules to directories with paths](https://code.claude.com/docs/en/claude-directory)
