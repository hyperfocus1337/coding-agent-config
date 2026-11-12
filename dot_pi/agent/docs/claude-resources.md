# Claude resources

[Agent directory](../README.md)

## Project Claude resources

### Scope and approval

The global `skills` array loads user skills only. Relative entries in user settings resolve from `~/.pi/agent`, not from the current repository. The `claude-project` coordinator approves local resources.

Each resource extension consumes its approval event:

- `claude-commands` registers commands.
- `claude-rules` loads rules.
- `claude-skills` adds `<cwd>/.claude/skills` through pi's resource hook.

The three resource extensions can be enabled independently. No project `.pi/settings.json` is required. See [project resources](../extensions/claude-commands/README.md#project-resources) for trust decisions and name conflicts.

### Reload project resources

Run pi from the repository root, then use `/reload` to pick up new files.

## The `skills` array

### Skill loading and compatibility

pi implements the same Agent Skills standard as Claude Code, so every `SKILL.md` under `~/.claude/skills` registers unchanged as `/skill:<name>`, with `name` and `description` read by pi's own loader. That covers the skills in `dot_claude/skills/` and the ones APM installs next to them. pi delivers the raw skill body: no `` !`cmd` `` span, no `@file` inlining, no `$ARGUMENTS`, no `context: fork`. No skill in this repository uses them.

### Exclude the claude.ai cache

The exclusion covers `~/.claude/skills/synced/`, which Claude Code fills from claude.ai with one bucket per organisation, named `<org id>_<user id>`. Each bucket holds the same set of Anthropic skills, so with two organisations every name appears twice and pi reports `[Skill conflicts]` on `/reload`. Those skills belong to claude.ai (`docs`, `morning`, and `import-memory` do nothing outside it), the directory is not in this repository, and pi already loads the repository's own `meeting-summarizer`, so pi skips the whole directory. A skill that exists only in a bucket can be brought back with a `+` entry naming its path.

### Exclusion path matching

The pattern is written relative to `~/.pi/agent`, not with `~`. pi expands `~` in a plain path entry, but it matches a `!` pattern with minimatch (`matchesAnyPattern` in `dist/core/package-manager.js`) against three strings: the path relative to `~/.pi/agent`, the basename, and the absolute path. None of them contains `~`, so `!~/.claude/skills/synced/**` matches nothing. `!**/synced/**` fails too, because minimatch does not let `**` cross the `.claude` dot segment without `dot: true`. The relative form works on this container and on the macOS host alike; an absolute path would not.
