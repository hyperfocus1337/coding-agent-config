# organize-with-comments

A Claude skill that reorganizes config and code files into clearly labeled, comment-delimited sections. Preserves every value; only reorders content and adds section headers in a comment style you choose.

## Install

| Component                 | Path                               |
|---------------------------|------------------------------------|
| Skill                     | `~/.claude/skills/organize/`       |
| Slash commands (optional) | `~/.claude/commands/organize/*.md` |

Replace `~/.claude/` with `<project>/.claude/` to scope to a project.

## Invoke

- **Auto**: ask Claude to "organize", "tidy", "group", "compartmentalize", or "section" a file. The skill prompts you to pick a comment style before it starts.
- **Style-specific commands**: skip the prompt by naming the style up front.

| Command                            | Header style                                      |
|------------------------------------|---------------------------------------------------|
| `/organize:plain-comments`         | Just the comment character and the name           |
| `/organize:minimal-comments`       | Single-line divider                               |
| `/organize:trailing-rule-comments` | Name flush-left with a rule trailing to width     |
| `/organize:banner-comments`        | Three-line rule around the name                   |
| `/organize:numbered-comments`      | Numbered banner plus a numbered table of contents |
| `/organize:underlined-comments`    | Name with a rule on the line beneath it           |
| `/organize:boxed-comments`         | Full box around the name                          |

Each command takes a `<file-path-or-glob>` argument and is a thin wrapper that invokes the skill with the style pre-selected, so `SKILL.md` stays the single source of truth for the technique.

## Supported file types

Anything with line-comment syntax: shell, YAML, TOML, INI, SQL, HCL, Emacs Lisp, Nginx, Apache, XML, HTML, C-family. JSON is rejected (no comment support); the skill proposes JSONC or a YAML/TOML rewrite instead.

See `SKILL.md` for the full technique, the comment-style catalog, and constraints.
