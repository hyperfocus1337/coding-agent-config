---
name: organize-with-comments
description: Reorganize a configuration or code file into clearly labeled, comment-delimited sections so the contents are easier for humans to scan. Use whenever the user asks to organize, tidy, group, categorize, compartmentalize, section, or "make readable" a config file, dotfile, shell rc, .env, .conf, .ini, .toml, .yaml, terraform, nginx config, or similar. Trigger this skill even when the user does not say the word "skill", as long as the intent is to reorganize an existing file by grouping related settings under comment headers.
---

# organize-with-comments

Take a config or code file and restructure it into logical, labeled sections without changing what it does.

## When to use this

The user has a file (often messy, often grown by accretion) and wants it grouped so a human can scan it quickly. Common phrasings:

- "organize this config"
- "group these settings"
- "section this off"
- "make this readable"
- "compartmentalize this"
- "tidy up my .zshrc / nginx.conf / terraform / .env"

## The process

1. **Read the whole file first.** Do not start reordering before you have seen all of it.
2. **Identify the comment syntax** for the file type (see table below). If the file uses an unusual syntax, mirror what is already there.
3. **Group related items** into 3 to 8 sections. Good grouping axes: purpose (networking, auth, logging), lifecycle (init, runtime, cleanup), subject (per service, per host), origin (user-set vs default overrides).
4. **Write a banner comment** at the top of each group using the format below.
5. **Preserve every value verbatim.** This skill reorganizes; it does not edit, refactor, or "improve" settings. If a value looks wrong, surface it as a separate note rather than silently changing it.
6. **Preserve any functionally required ordering** (shell variable dependencies, `source` lines, route precedence, OS-specific guards). When in doubt, leave the relative order as-is within a group.
7. **Add a short table of contents** at the very top only if the file has 5+ sections or exceeds ~150 lines. Skip it otherwise.

## Banner format

Use a three-line banner so sections are visible when scrolling fast:

```
# ============================================================
# Section name
# ============================================================
```

Use the file's native comment character (`#`, `//`, `;`, `--`, etc.). Keep banner width consistent across the file (60 chars is a good default). No ASCII art, no emoji unless the user asks for it.

## Comment characters by file type

| Family | Example files | Line comment |
|---|---|---|
| Shell, YAML, TOML, Python, Ruby, Nginx, Dockerfile, gitconfig, Makefile, tfvars | `.sh`, `.zshrc`, `.bashrc`, `config.fish`, `.yml`, `.toml`, `.conf` | `#` |
| C-family, Terraform HCL, JS, Go, Rust | `.tf`, `.js`, `.go`, `.rs` | `//` |
| INI, some Windows configs | `.ini` | `;` |
| SQL | `.sql` | `--` |
| Emacs Lisp | `.el` | `;;;` for section headers (Elisp convention), `;;` inline |
| Apache, XML, HTML | `.htaccess`, `.xml`, `.html` | `<!-- ... -->` |

JSON does not support comments. If the file is `.json`, tell the user and offer JSONC (`.jsonc`) or a YAML/TOML rewrite instead.

## Inline comments

Add a short trailing comment **only** for non-obvious settings: cryptic values, magic numbers, workarounds, version-specific quirks. Do not annotate self-explanatory keys like `port = 8080`.

## Example

Before:

```toml
api_key = "..."
log_level = "info"
db_host = "localhost"
retry = 3
db_port = 5432
log_file = "/var/log/app.log"
timeout = 30
db_user = "app"
```

After:

```toml
# ============================================================
# Database
# ============================================================
db_host = "localhost"
db_port = 5432
db_user = "app"

# ============================================================
# Logging
# ============================================================
log_level = "info"
log_file = "/var/log/app.log"

# ============================================================
# API & networking
# ============================================================
api_key = "..."
timeout = 30   # seconds; raise if upstream is slow
retry = 3
```

## Don'ts

- Don't change values, rename keys, or "fix" config that looks wrong without flagging it separately.
- Don't reorder things where order is load-bearing (shell var deps, route order, etc.).
- Don't add commentary that just restates the key name.
- Don't introduce a new comment style if the file already uses one.
- Don't strip existing comments. Move them with the setting they belong to.

## Output

Return the reorganized file. If it was provided as a path on disk, write the result back to the same path (or to a `.organized` sibling if the user asked for a preview). Briefly summarize the sections you created.