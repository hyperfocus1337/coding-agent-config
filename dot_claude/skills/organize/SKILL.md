---
name: organize-with-comments
description: Reorganize a configuration or code file into clearly labeled, comment-delimited sections so the contents are easier for humans to scan, prompting the user to pick a comment/header style first. Use whenever the user asks to organize, tidy, group, categorize, compartmentalize, section, or "make readable" a config file, dotfile, shell rc, .env, .conf, .ini, .toml, .yaml, terraform, nginx config, or similar. Trigger this skill even when the user does not say the word "skill", as long as the intent is to reorganize an existing file by grouping related settings under comment headers.
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
3. **Ask the user which comment style they want** (see the style catalog below), unless they already named one in their request. Use `AskUserQuestion` with the styles as options and include a short rendered preview for each so they can see the look before choosing. If the file already uses a recognizable section style, offer "keep the existing style" as the first option.
4. **Group related items** into relevant sections (if applicable). Good grouping axes: purpose (networking, auth, logging), lifecycle (init, runtime, cleanup), subject (per service, per host), origin (user-set vs default overrides).
5. **Write a section header** at the top of each group in the chosen style.
6. **Preserve every value verbatim.** This skill reorganizes; it does not edit, refactor, or "improve" settings. If a value looks wrong, surface it as a separate note rather than silently changing it.
7. **Preserve any functionally required ordering** (shell variable dependencies, `source` lines, route precedence, OS-specific guards). When in doubt, leave the relative order as-is within a group.
8. **Add a short table of contents** at the very top only if the file has 5+ sections or exceeds ~150 lines. Skip it otherwise. Match the TOC to the chosen style (plain list, or numbered when the numbered style is used).

## Comment style catalog

Offer these styles when prompting. Every style uses the file's native comment character (`#`, `//`, `;`, `--`, etc.); the examples below use `#`. Keep whatever style is chosen consistent across the whole file, and keep a consistent width (60 chars is a good default for anything with a rule).

**Plain** — just the comment character(s) and the name, no rule or divider; lowest weight, closest to how most people hand-comment:

```
# Section name
```

Some file types conventionally use multiple comment characters for headers (`##` or `###` in shell/Python, `;;;` in Elisp). Match that convention if the file already does, otherwise a single character is fine:

```
## Section name
```

**Minimal** — a single-line divider, low visual weight, good for short files:

```
# --- Section name ---
```

**Banner** (default) — a three-line rule, most visible when scrolling fast:

```
# ============================================================
# Section name
# ============================================================
```

**Numbered** — banner or minimal header prefixed with a section number, pairs with a numbered table of contents:

```
# ============================================================
# 1. Section name
# ============================================================
```

**Underline** — the name with a rule under it, compact but still scannable:

```
# Section name
# ============
```

**Boxed** — a full box, highest emphasis, good for large files with few sections:

```
# ┌──────────────────────────────────────────────────────────┐
# │ Section name                                             │
# └──────────────────────────────────────────────────────────┘
```

Use plain ASCII (`+`, `-`, `|`) instead of box-drawing characters if the user prefers ASCII-only or the file already avoids Unicode.

No ASCII art beyond the boxed style, no emoji or figlet-style headers unless the user explicitly asks for them.

## Comment characters by file type

| Family                                                                          | Example files                                                       | Line comment                                              |
|---------------------------------------------------------------------------------|---------------------------------------------------------------------|-----------------------------------------------------------|
| Shell, YAML, TOML, Python, Ruby, Nginx, Dockerfile, gitconfig, Makefile, tfvars | `.sh`, `.zshrc`, `.bashrc`, `config.fish`, `.yml`, `.toml`, `.conf` | `#`                                                       |
| C-family, Terraform HCL, JS, Go, Rust                                           | `.tf`, `.js`, `.go`, `.rs`                                          | `//`                                                      |
| INI, some Windows configs                                                       | `.ini`                                                              | `;`                                                       |
| SQL                                                                             | `.sql`                                                              | `--`                                                      |
| Emacs Lisp                                                                      | `.el`                                                               | `;;;` for section headers (Elisp convention), `;;` inline |
| Apache, XML, HTML                                                               | `.htaccess`, `.xml`, `.html`                                        | `<!-- ... -->`                                            |

JSON does not support comments. If the file is `.json`, tell the user and offer JSONC (`.jsonc`) or a YAML/TOML rewrite instead.

## Inline comments

Add a short trailing comment **only** for non-obvious settings: cryptic values, magic numbers, workarounds, version-specific quirks. Do not annotate self-explanatory keys like `port = 8080`.

## Example

Before:

```toml
log_level = "info"
db_host = "localhost"
db_port = 5432
log_file = "/var/log/app.log"
db_user = "app"
```

After (minimal style):

```toml
# --- Database ---
db_host = "localhost"
db_port = 5432
db_user = "app"

# --- Logging ---
log_level = "info"
log_file = "/var/log/app.log"
```

## Don'ts

- Don't change values, rename keys, or "fix" config that looks wrong without flagging it separately.
- Don't reorder things where order is load-bearing (shell var deps, route order, etc.).
- Don't add commentary that just restates the key name.
- Don't switch to a new style silently when the file already uses one; offer "keep the existing style" as the first option and only change on the user's say-so.
- Don't strip existing comments. Move them with the setting they belong to.

## Output

Return the reorganized file. If it was provided as a path on disk, write the result back to the same path (or to a `.organized` sibling if the user asked for a preview). Briefly summarize the sections you created.
