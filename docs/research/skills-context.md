# Session-start context budget

Every skill, command and agent this machine installs contributes one line to a listing that Claude Code injects at session start: the entry's name plus its frontmatter `description`. This "breadcrumb" is the only part loaded up front. The body of `SKILL.md`, its `references/`, `scripts/`, and any bundled files cost zero tokens until the entry is actually invoked, and scripts Claude runs never enter context at all, only their output does.

This doc measures what that standing cost currently is. Numbers come from [`scripts/context-budget/measure-context.py`](../../scripts/context-budget/measure-context.py), which walks `~/.claude` plus every installed plugin, reconstructs the listings, and counts characters with tokens estimated at length over four. Snapshot taken 2026-08-11.

Earlier versions of this doc counted skills only and assumed every `SKILL.md` on disk becomes a breadcrumb. Both assumptions were wrong. The gating rules below were found by diffing the on-disk files against the listing a live session actually received.

## What reaches the model, and what does not

A `SKILL.md`, command, or agent file on disk is not automatically a breadcrumb. Three filters apply:

A plugin manifest's `skills` array, when present, gates which on-disk skills register at all. `mattpocock-skills` ships 35 `SKILL.md` files but declares only 25 in `.claude-plugin/plugin.json`, so the other 10 (everything under `skills/in-progress/` and `skills/misc/`) are inert files.

`disable-model-invocation: true` keeps an entry out of the model-facing listing. It stays reachable as an explicit `/slash-command`, but Claude cannot auto-select it and never sees its description. Of `mattpocock-skills`' 25 declared skills, 14 carry this flag, so only 11 appear. Same mechanism trims `codex` from 7 commands to 2, and hides the local `thermo-nuclear-code-quality-review` skill (its twin in the agents listing is what shows up instead).

An entry with no `description` never reaches the listing. `code-refactoring`'s three commands have none, so the plugin contributes agents only.

Skills and commands share one listing block, so a command in `~/.claude/commands/` costs exactly what a skill of the same verbosity costs. Agents are a separate listing. This repo's 26 user-level commands are therefore a real slice of the skills budget, not free.

## Current cost

### Enabled (loaded every session)

| Source                                            | Skills |   Cmds | Agents |      Chars |    ~Tokens |
| ------------------------------------------------- | -----: | -----: | -----: | ---------: | ---------: |
| `~/.claude` (16 skills, 25 commands, 2 agents)    |     16 |     25 |      2 |      8,967 |      2,242 |
| `ponytail@ponytail`                               |      6 |      0 |      0 |      2,736 |        684 |
| `mattpocock-skills@mattpocock`                    |     11 |      0 |      0 |      2,645 |        661 |
| `iterative-development@prime-radiant-marketplace` |      6 |      0 |      0 |      1,776 |        444 |
| `caveman@caveman`                                 |      4 |      0 |      0 |      1,331 |        333 |
| `codex@openai-codex`                              |      3 |      2 |      1 |        838 |        210 |
| `feature-dev@claude-plugins-official`             |      0 |      1 |      3 |        829 |        207 |
| `code-refactoring@claude-code-workflows`          |      0 |      0 |      2 |        635 |        159 |
| `astral@astral-sh`                                |      3 |      0 |      0 |        473 |        118 |
| `context7@context7-marketplace`                   |      1 |      1 |      1 |        478 |        120 |
| `ast-grep@ast-grep-marketplace`                   |      1 |      0 |      0 |        447 |        112 |
| `code-simplifier@claude-plugins-official`         |      0 |      0 |      1 |        208 |         52 |
| `watch@claude-video`                              |      0 |      1 |      0 |        189 |         47 |
| `code-review@claude-plugins-official`             |      0 |      1 |      0 |         54 |         14 |
| **Total from disk**                               | **51** | **31** | **10** | **21,606** | **~5,401** |

The skill and command listing alone is 82 entries and 19,186 characters; the agents listing adds 2,420.

### Not on disk, still charged

Two costs the script cannot see, measured separately:

Claude Code's own built-in skills (`dataviz`, `claude-api`, `artifact-*`, `update-config`, `code-review`, `simplify`, `loop`, `schedule`, `run`, `init`, `security-review`, `keybindings-help`, `fewer-permission-prompts`) add 15 entries and roughly **6,000 characters**. Two of them dominate: `dataviz` at 1,182 characters and `claude-api` at 1,086. These are not configurable from this repo, but they are the single largest block competing for the same listing budget.

`SessionStart` hooks inject plain text straight into the conversation, which is not a listing and is never truncated. `ponytail` injects its full mode description at roughly **5,100 characters** on every startup, resume, clear and compact; `caveman` adds about **1,700**; `watch` adds a 130-character setup reminder. That is **~6,900 characters (~1,700 tokens)** of instruction text per session, more than any single plugin's breadcrumbs and more than double `ponytail`'s own listing cost. It also re-fires on compaction, so a long session pays it repeatedly.

For comparison, the whole `CLAUDE.md` plus its five `rules/` files total 3,071 characters. The activation hooks cost more than twice the hand-written instructions.

### Installed but disabled (on disk, not loaded)

Reserve cost that reappears the moment these are switched on in `enabledPlugins`.

| Source                                              | Skills |   Cmds | Agents |      Chars |    ~Tokens |
| --------------------------------------------------- | -----: | -----: | -----: | ---------: | ---------: |
| `cloudflare@cloudflare`                             |      8 |      2 |      0 |      3,574 |        893 |
| `superpowers@claude-plugins-official`               |     14 |      0 |      0 |      2,390 |        597 |
| `notion-workspace-plugin@notion-plugin-marketplace` |      4 |     10 |      0 |      2,328 |        582 |
| `chrome-devtools-mcp@chrome-devtools-plugins`       |      6 |      0 |      0 |      1,720 |        430 |
| `greenfield@prime-radiant-marketplace`              |      0 |      2 |      2 |        555 |        138 |
| `commit-commands@claude-plugins-official`           |      0 |      3 |      0 |        296 |         74 |
| **Total**                                           | **32** | **17** |  **2** | **10,863** | **~2,715** |

Enabling everything would push the skill and command listing past 30,000 characters.

## Two config bugs found while measuring

`context7-plugin@context7-marketplace` is set to `true` in `enabledPlugins` but does not exist in `installed_plugins.json`. It is a dead entry from the pre-migration plugin name, costing nothing but guaranteed to confuse the next audit. The measurement script now warns about enabled-but-missing plugins.

context7 is registered twice: once as a user-scoped MCP server in `~/.claude/.claude.json` (written by APM from `apm.yml`) and once by the `context7@context7-marketplace` plugin. A live session shows both server instruction blocks and both tool sets (`mcp__context7__*` and `mcp__plugin_context7_context7__*`), roughly 1,400 characters of duplicated instructions plus a duplicated toolset. Pick one channel.

## The real constraint is truncation, not tokens

Token cost is small and linear. Roughly 5,400 tokens of listings from disk, plus ~1,500 for the built-ins and ~1,700 for hook injections, is well under 1% of a 1M context window.

The constraint is the character budget on the listing itself. Claude Code scales that at roughly 1% of the model's context window: about 2,000 characters at 200k, about 10,000 at 1M. The listing always contains every name, but when the descriptions overflow, Claude Code shortens them to fit, dropping description text starting with the entries invoked least so the ones used most keep their keywords.

This machine's skill and command listing is **19,186 characters from disk plus ~6,000 from built-ins**, so about 25,000 against a 10,000-character budget on the 1M-context Opus this machine runs. Truncation is not a future risk, it is already happening at roughly 2.5x over budget. Rarely-used entries have effectively lost their descriptions in the auto-invocation listing. They remain callable as `/name`, but Claude can no longer match them to a request, because there is no description left to match against.

Note the interaction with the built-ins: they are heavy, they cannot be removed, and they compete in the same budget. Every character trimmed locally buys headroom for entries this repo actually cares about.

## What to do about it

**Trim the activation hooks first.** `ponytail` and `caveman` together inject ~6,900 characters of untruncatable text on every session start and every compaction. This is the largest single lever and the only one that pays on every compaction rather than once. Both plugins support intensity levels; a lighter level, or dropping one of the two, is a direct saving with no effect on the listing budget.

**Cut the heaviest breadcrumbs.** The top of the list, with characters:

| Entry                           | Chars | Source           |
| ------------------------------- | ----: | ---------------- |
| `ponytail:ponytail`             |   848 | plugin           |
| `meeting-summarizer`            |   721 | local, this repo |
| `neon-postgres`                 |   671 | standalone skill |
| `organize-with-comments`        |   610 | local, this repo |
| `neon-postgres-branches`        |   547 | standalone skill |
| `neon`                          |   547 | standalone skill |
| `ponytail:ponytail-review`      |   486 | plugin           |
| `mattpocock-skills:code-review` |   451 | plugin           |
| `ast-grep:ast-grep`             |   446 | plugin           |
| `cmux-settings`                 |   437 | local            |
| `install-mcp`                   |   435 | local, this repo |

The three `neon` skills together cost 1,765 characters for one vendor's database, and the six `ponytail` entries cost 2,736. Only the locally-authored ones (`meeting-summarizer`, `organize-with-comments`, `install-mcp`) are directly editable here; trimming their trigger lists to distinctive keywords is the cheapest win available.

**Use `disable-model-invocation: true` deliberately.** It is the precise tool for this problem: an entry you always invoke by hand (`/organize`, `/git:commit`, setup-style skills) does not need a description in the auto-invocation listing at all. Setting the flag removes its breadcrumb entirely while keeping the slash command working. This repo's 26 user-level commands cost 2,466 characters and are almost all hand-invoked, so this is a large, low-risk cut that no other lever offers.

**Leave heavy bundles disabled.** `cloudflare` (3,574 chars) and `superpowers` (2,390) are the biggest available swings; the disabled table is a menu of what each toggle costs.

**Prefer project-scoped entries.** A skill in a repo's `.claude/skills/` loads only in that repo. The seven `cmux` skills (1,917 characters) load in every session on this machine regardless of whether cmux is in play.

**Remember the body is free.** Splitting a skill into a lean breadcrumb plus a fat `SKILL.md` costs nothing until invocation, so descriptions are the only part worth cutting for context reasons. Once invoked, the rendered `SKILL.md` stays in context for the rest of the session and is not re-read on later turns.

## Reproducing these numbers

```
python3 scripts/context-budget/measure-context.py
```

Re-run whenever the enabled set changes. The figures here are a snapshot and drift as plugins are toggled and bundles re-resolve to latest on install. The script does not measure built-in skills or hook injections; those were measured by hand as described above.

Sources: [Claude Code skills docs](https://code.claude.com/docs/en/skills), [Agent Skills overview](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview).
