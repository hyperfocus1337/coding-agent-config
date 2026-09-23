# Project agent config

## Path-scoped rules

A rule with `paths:` frontmatter loads only after the agent opens a matching file with a file tool, for example Read. A Bash command such as `mv`, `sed`, or a heredoc on a matching path does not load the rule.

`rules/apply.md` used to have `paths:` for `dot_claude/**`, `dot_config/**`, and `dot_pi/**`. In one session, the agent created and moved command files under `dot_claude/` with Bash and one Write of a new file. The rule did not load, so the agent did not run `just chezmoi`.

Use `paths:` only for a rule that is safe to miss. Leave out `paths:` for a rule that must always apply, such as `apply.md`.
