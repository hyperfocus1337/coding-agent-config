# Claude rules

| Rule                       | What it governs                                                                                                            |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| [`writing.md`](writing.md) | Prose in ASD-STE100 Simplified Technical English, plus formatting: no hard wrapping, no em dashes, sentence-case headings. |
| [`tools.md`](tools.md)     | Which tool to reach for: `rg`/`fd` over Grep/Glob, LSP for navigation, ast-grep for structure, Context7 for docs, `pnpm`.  |
| [`code.md`](code.md)       | How much to build: a seven-rung ladder from "does this need to exist" to "write the minimum code that works".              |

All three are unscoped, so they load at session start. Together with `CLAUDE.md` they are about 715 words, which is the budget the principles below defend.

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

## Provenance

`code.md` condenses the [ponytail plugin](https://github.com/DietrichGebert/ponytail)'s `SessionStart` instructions into 13 directives, from about 40 across 5,252 characters. The plugin is not installed; this rule carries the behaviour. It keeps the upstream `ponytail:` marker name, which `hooks/format-all-languages/hook.sh` and `hooks/enforce-cli-tools/hook.sh` use to mark a deliberate shortcut with a known ceiling. `docs/research/instruction-load.md` covers which parts of a directive set are safe to drop and which conditions must survive.

## Sources

- [Claude Code memory docs, path-scoped rules](https://code.claude.com/docs/en/memory)
- [Claude Code directory docs, scope rules to directories with paths](https://code.claude.com/docs/en/claude-directory)
