# organize-with-comments

A Claude skill that reorganizes config and code files into clearly labeled, comment-delimited sections. Preserves every value; only reorders content and adds banner comments.

## Install

| Component                | Path                                           |
| ------------------------ | ---------------------------------------------- |
| Skill                    | `~/.claude/skills/organize-with-comments/`     |
| Slash command (optional) | `~/.claude/commands/organize-with-comments.md` |

Replace `~/.claude/` with `<project>/.claude/` to scope to a project.

## Invoke

- **Auto**: ask Claude to "organize", "tidy", "group", "compartmentalize", or "section" a file.
- **Explicit**: `/organize-with-comments <file-path-or-glob>`

The slash command is a thin pointer to the skill, so `SKILL.md` is the single source of truth for the technique.

## Example

Before:

```toml
api_key = "..."
db_host = "localhost"
log_level = "info"
db_port = 5432
```

After:

```toml
# ============================================================
# Database
# ============================================================
db_host = "localhost"
db_port = 5432

# ============================================================
# API & logging
# ============================================================
api_key = "..."
log_level = "info"
```

## Supported file types

Anything with line-comment syntax: shell, YAML, TOML, INI, SQL, HCL, Emacs Lisp, Nginx, Apache, XML, HTML, C-family. JSON is rejected (no comment support); the skill proposes JSONC or a YAML/TOML rewrite instead.

See `SKILL.md` for the full technique and constraints.