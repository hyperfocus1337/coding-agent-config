# Session-start context budget

Every skill, command and agent this machine installs contributes one line to a listing that Claude Code injects at session start: the entry's name plus its frontmatter `description`. This "breadcrumb" is the only part loaded up front. The body of `SKILL.md`, its `references/`, `scripts/`, and any bundled files cost zero tokens until the entry is actually invoked, and scripts Claude runs never enter context at all, only their output does.

This doc measures what that standing cost currently is. Numbers come from [`scripts/context-budget/measure-context.py`](../../scripts/context-budget/measure-context.py), which walks `~/.claude` plus every installed plugin, reconstructs the listings, and counts characters with tokens estimated at length over four. Snapshot taken 2026-08-16.

It replaces figures that were not all measured on one day: the tables came from a run on 2026-08-11 (`37f27b2`), the `~/.claude` breakdown was added on 2026-08-12 (`032b648`), and the command trim they recommended was applied on 2026-08-15 (`f8e2223`) without re-running the script. Treat "the earlier snapshot" below as that 2026-08-11 to 08-15 range, not a single reading.

On 2026-08-16 the scope work followed: seven plugins removed, eight moved to project or local scope, and the neon and cmux skill bundles taken out of the user-scope `apm.yml`. The enabled skill and command listing fell from 19,233 characters to 11,045, a 43% cut. [What changed](#what-changed-since-the-first-snapshot) lists each move.

Earlier versions of this doc counted skills only and assumed every `SKILL.md` on disk becomes a breadcrumb. Both assumptions were wrong. The gating rules below were found by diffing the on-disk files against the listing a live session actually received.

## What reaches the model, and what does not

A `SKILL.md`, command, or agent file on disk is not automatically a breadcrumb. Three filters apply:

A plugin manifest's `skills` array, when present, gates which on-disk skills register at all. `mattpocock-skills` ships 35 `SKILL.md` files but declares only 25 in `.claude-plugin/plugin.json`, so the other 10 (everything under `skills/in-progress/` and `skills/misc/`) are inert files.

`disable-model-invocation: true` keeps an entry out of the model-facing listing. It stays reachable as an explicit `/slash-command`, but Claude cannot auto-select it and never sees its description. Of `mattpocock-skills`' 25 declared skills, 14 carry this flag, so only 11 appear. Same mechanism trims `codex` from 7 commands to 2, and hides the local `thermo-nuclear-code-quality-review` skill (its twin in the agents listing is what shows up instead).

An entry with no `description` never reaches the listing, with one exception. A user-level command file with no frontmatter at all is still listed, using its H1 as the description: `commands/git/README.md` is not a command but shows up as `git:README: git slash commands`. Plugin command files in exactly the same shape (`code-refactoring`'s three, which are prompt bodies with an H1 and no frontmatter) were not observed in the listing, so the fallback appears to be user-level only. The measurement script encodes it that way and says so in a comment; if a future session shows plugin equivalents listed, that assumption is what to revisit.

Skills and commands share one listing block, so a command in `~/.claude/commands/` costs exactly what a skill of the same verbosity costs. Agents are a separate listing. This repo's 28 user-level commands were therefore a real slice of the skills budget, not free; 23 of them now carry the flag above and cost nothing.

## Current cost

### Enabled (loaded every session)

| Source                            | Skills |  Cmds | Agents |      Chars |    ~Tokens |
| --------------------------------- | -----: | ----: | -----: | ---------: | ---------: |
| `~/.claude` (see breakdown below) |      6 |     5 |      2 |      3,296 |        824 |
| `ponytail@ponytail`               |      6 |     0 |      0 |      2,736 |        684 |
| `mattpocock-skills@mattpocock`    |     11 |     0 |      0 |      2,645 |        661 |
| `caveman@caveman`                 |      4 |     0 |      0 |      1,331 |        333 |
| `codex@openai-codex`              |      3 |     2 |      1 |        838 |        210 |
| `astral@astral-sh`                |      3 |     0 |      0 |        473 |        118 |
| `ast-grep@ast-grep-marketplace`   |      1 |     0 |      0 |        447 |        112 |
| **Total from disk**               | **34** | **7** |  **3** | **11,766** | **~2,941** |
| _2026-08-11 total, for reference_ |   _51_ |  _32_ |   _10_ |   _21,653_ |   _~5,413_ |

The skill and command listing alone is 41 entries and 11,045 characters; the agents listing adds 721. Against the 2026-08-11 run that is 42 fewer entries and 9,887 fewer characters, a 46% cut across all three listings.

Three separate changes produced that, and only the first two are this repo's scope work:

| Change                                                        | Chars | When       |
| ------------------------------------------------------------- | ----: | ---------- |
| Plugins removed or moved off user scope                       | 4,169 | 2026-08-16 |
| neon and cmux out of `~/.claude/skills/`, `install-*` flagged | 3,391 | 2026-08-16 |
| Command trim, applied earlier but never re-measured           | 2,285 | 2026-08-15 |

The command trim was already committed when the 2026-08-11 tables were still standing, so part of this delta is a measurement catching up rather than a new saving.

Those three rows sum to 9,845, not 9,887. The 42-character gap is inside the 2026-08-11 figures themselves: that snapshot's `~/.claude` row totalled 9,014 while its skills, commands and agents parts summed to 8,970. The old total is kept as printed rather than silently corrected.

Six plugins remain at user scope. Every other plugin either moved to project or local scope, where it costs nothing until a repo asks for it, or was removed outright.

### What is in the `~/.claude` row

That row is the largest single source and the only one this repo controls directly, so it is worth expanding. Per-entry figures below are the rendered breadcrumb (`- name: description`) without its trailing newline, which is why the group sums come out one character per entry below the table totals.

**Skills, 6 listed entries, 2,605 characters.** Ten skill directories sit in `~/.claude/skills/`; four carry `disable-model-invocation: true` and cost nothing:

| Channel                                     | Listed | Chars | Detail                                                                                                   |
| ------------------------------------------- | -----: | ----: | -------------------------------------------------------------------------------------------------------- |
| Local, authored here (`dot_claude/skills/`) |      4 | 2,265 | `meeting-summarizer` 721, `install-agent-resources` 720, `organize-with-comments` 610, `gh-cli` 214      |
| APM, `antonbabenko/terraform-skill`         |      1 |   239 | `terraform-skill`                                                                                        |
| Unmanaged                                   |      1 |    95 | `playwright-cli`                                                                                         |
| Flagged, not listed                         |      4 |     0 | `install-skills` 423, `install-mcp` 372, `install-plugins` 359, `thermo-nuclear-code-quality-review` 291 |

The three `install-*` executors carry the flag because `install-agent-resources` is the single entry point that routes to them; only the router needs a breadcrumb. `thermo-nuclear-code-quality-review` comes from the `cursor/plugins/cursor-team-kit` APM entry, which also deploys the kit's two agents, the whole of the agents column for this row.

The cmux (7 entries, 1,917 characters) and neon (3 entries, 1,765) bundles are gone from this row. Both are now non-user rows in the install-skills catalog, installed per repo, which removed 3,682 characters from every session on this machine. `playwright-cli` is still an orphan: installed 2026-07-21, present in `skills.json` as a project-scope row, so `skills/install.sh` will not reinstall it at user scope. It is cheap at 95 characters, but it will not survive a clean rebuild.

**Commands, 5 listed entries, 202 characters.** All are authored here, under `dot_claude/commands/`. The trim described below has been applied and measured:

| Entry          | Chars | Note                                                   |
| -------------- | ----: | ------------------------------------------------------ |
| `git:multiple` |    64 | listed                                                 |
| `git:pr`       |    37 | listed                                                 |
| `git:commit`   |    33 | listed                                                 |
| `git:README`   |    32 | H1 fallback, see below                                 |
| `git:push`     |    31 | listed                                                 |
| 23 others      |     0 | `disable-model-invocation: true`, reachable as `/name` |

`git:README` is documentation, not a command, and appears only through the no-frontmatter fallback. The repo copy carries the flag; the deployed copy in `~/.claude` predates it, so `just chezmoi` drops these last 32 characters.

### What a command breadcrumb actually buys

Worth being precise, because it decides how aggressively to trim. A command in the listing is callable by the model through the Skill tool, not just by a human typing `/name`. That is verifiable from a live session: `- git:commit: Create a git commit` appears in the skill listing, and the Skill tool's contract accepts only names from that listing. The negative case confirms the mechanism, `codex`'s flagged commands and `mattpocock-skills`' flagged skills are absent from the same listing.

But callable is not the same as chosen. Asked to commit, Claude generally commits directly rather than routing through `/git:commit`, because the task is within its default competence. The breadcrumb only earns its cost when the command encodes a procedure Claude would otherwise improvise differently, and when the request arrives in prose rather than as an explicit slash command. By that test most commands here are hand-invoked tools whose descriptions are dead weight in the auto-invocation listing, and only a few (`git:commit`, `git:multiple`, `git:pr`, which pin this repo's commit and PR conventions) have a real claim to auto-selection.

### Applied: command breadcrumb trim

Every command in `dot_claude/commands/` except `git:commit`, `git:multiple`, `git:pr` and `git:push` carries `disable-model-invocation: true`, which removes its breadcrumb while leaving `/name` working. The four exceptions pin this repo's commit and PR conventions, which is exactly the case where auto-selection beats improvising:

| Flagged                                                   |     Chars | Reason                                                                                                                                |
| --------------------------------------------------------- | --------: | ------------------------------------------------------------------------------------------------------------------------------------- |
| 8 × `organize:*`                                          |       984 | thin wrappers over the `organize-with-comments` skill, which already prompts for a style; the skill is the correct auto-invoke target |
| `issues:*` (3)                                            |       368 | each needs an issue number as an argument, so the request always arrives as a slash command                                           |
| `git:amend-author`, `git:amend-date`, `git:shift-dates`   |       279 | history surgery, never something to auto-select                                                                                       |
| `git:branches`, `git:worktrees`, `git:changelog`          |       365 | deliberate maintenance runs, invoked by hand at a moment of the user's choosing                                                       |
| `simple:explain`, `simple:proofread`, `simple:markitdown` |       192 | within default competence; the breadcrumb buys nothing the model cannot already do                                                    |
| `style:concise`, `style:current-state`                    |       136 | mode switches the user types explicitly                                                                                               |
| `summarize:transscripts`                                  |       102 | duplicates the `meeting-summarizer` skill (721 chars) on the same trigger                                                             |
| `git:README`                                              |        32 | documentation, listed only via the no-frontmatter fallback                                                                            |
| **Total**                                                 | **2,458** |                                                                                                                                       |

`dot_claude/commands/README.md` got the same flag pre-emptively; it is not yet deployed, and without the flag chezmoi would add it as another H1-fallback entry.

Measured after deployment: the user-level command listing is 5 entries and 202 characters, against 26 entries and 2,487 before flagging. The remaining 32 characters are the stale `git:README` copy described above, so the floor is 4 entries and 165 characters once chezmoi applies.

**Agents, 2 entries, 487 characters.** `thermo-nuclear-code-quality-review` 301 and `ci-watcher` 186, both deployed by the `cursor-team-kit` APM entry. `apm.yml` notes there is no `agents:` subset key, so taking that kit's one skill means taking both agents. The other six agents that used to load, three from `feature-dev`, two from `code-refactoring` and one from `code-simplifier`, left with those plugins; only `codex-rescue` remains beside them, from `codex`.

### Not on disk, still charged

Two costs the script cannot see, measured separately:

Claude Code's own built-in skills (`dataviz`, `claude-api`, `artifact-*`, `update-config`, `code-review`, `simplify`, `loop`, `schedule`, `run`, `init`, `security-review`, `keybindings-help`, `fewer-permission-prompts`) add 15 entries and roughly **6,000 characters**. Two of them dominate: `dataviz` at 1,182 characters and `claude-api` at 1,086. These are not configurable from this repo, but they are the single largest block competing for the same listing budget.

`SessionStart` hooks inject plain text straight into the conversation, which is not a listing and is never truncated. `ponytail` injects its full mode description at roughly **5,100 characters** on every startup, resume, clear and compact; `caveman` adds about **1,700**. That is **~6,800 characters (~1,700 tokens)** of instruction text per session, more than any single plugin's breadcrumbs and more than double `ponytail`'s own listing cost. It also re-fires on compaction, so a long session pays it repeatedly. `watch`'s 130-character setup reminder is gone with the plugin.

These two hooks are now the largest single cost on this machine. They survived a cleanup that cut every listing by 46%, so they are worth **58% of what the whole enabled listing costs** and are untouched by any scope decision.

For comparison, the whole `CLAUDE.md` plus its five `rules/` files total 3,071 characters. The activation hooks cost more than twice the hand-written instructions.

### Installed but disabled (on disk, not loaded)

Reserve cost that reappears the moment these are switched on in `enabledPlugins`. One plugin is left in this state:

| Source                                        | Skills |  Cmds | Agents |     Chars |  ~Tokens |
| --------------------------------------------- | -----: | ----: | -----: | --------: | -------: |
| `chrome-devtools-mcp@chrome-devtools-plugins` |      6 |     0 |      0 |     1,733 |      433 |
| **Total**                                     |  **6** | **0** |  **0** | **1,733** | **~433** |

It stays installed-and-disabled for one reason: a plugin's MCP servers cannot be disabled individually, so disabling the whole plugin is the only lever short of uninstalling it. See [`docs/mcp/disabling-servers.md`](../mcp/disabling-servers.md).

The other five rows that used to be here are gone. `cloudflare` (3,574) and `notion-workspace-plugin` (2,328) moved to project scope, where a repo that needs them installs them. `superpowers` (2,390), `greenfield` (555) and `commit-commands` (296) were uninstalled. Disabling was doing the same job as not installing, but left 9,143 characters of reserve on disk and a `false` entry to maintain in `settings.json`.

## What changed since the first snapshot

The 2026-08-11 measurement recommended project scope over user scope, and disabling over enabling. Acting on it on 2026-08-16 produced the numbers above.

**Removed, seven plugins.** `code-review` and `code-simplifier` duplicated the built-in `/code-review` and `/simplify`. `commit-commands` was already reimplemented as `dot_claude/commands/git/`. `context7` bundled a second copy of the MCP server `apm.yml` installs, and `pyright@claude-code-lsps` a second Python LSP wiring beside `pyright-lsp`. `superpowers` and `greenfield` were installed but disabled, so removal only formalized what was already true.

**Moved to project scope, seven plugins and one skill bundle.** `cloudflare`, `notion-workspace-plugin`, `feature-dev`, `code-refactoring`, `glab`, `iterative-development`, `pyright-lsp`, plus `neondatabase/agent-skills`. Each now costs zero here and is installed per repo through the `install-plugins` or `install-skills` skill.

**Moved to local scope, one plugin and one skill bundle.** `watch@claude-video` and `manaflow-ai/cmux`, both personal tooling rather than a team convention.

**Two config bugs, both fixed.** The dead `context7-plugin@context7-marketplace` entry in `enabledPlugins` is deleted, along with two more stale marketplaces found the same way. And context7 is no longer registered twice: the plugin is gone, so only the APM-managed MCP server remains, ending the duplicated instruction block and duplicated toolset (`mcp__context7__*` and `mcp__plugin_context7_context7__*`) worth roughly 1,400 characters. The measurement script warns about enabled-but-missing plugins, which is what surfaced the first bug.

`settings.json`, the plugin catalog, and the machine now agree exactly: seven `scope: "user"` rows, seven `enabledPlugins` entries, seven installed plugins, and no marketplace without a backing row.

## The real constraint is truncation, not tokens

Token cost is small and linear. Roughly 2,900 tokens of listings from disk, plus ~1,500 for the built-ins and ~1,700 for hook injections, is well under 1% of a 1M context window.

The constraint is the character budget on the listing itself. Claude Code scales that at roughly 1% of the model's context window: about 2,000 characters at 200k, about 10,000 at 1M. The listing always contains every name, but when the descriptions overflow, Claude Code shortens them to fit, dropping description text starting with the entries invoked least so the ones used most keep their keywords.

This machine's skill and command listing is **11,045 characters from disk plus ~6,000 from built-ins**, so about 17,000 against a 10,000-character budget on the 1M-context Opus this machine runs. Before the cleanup it was about 25,000, or 2.5x over budget; it is now roughly 1.7x over. Truncation is therefore still happening, just to fewer entries: rarely-used ones lose their descriptions in the auto-invocation listing, stay callable as `/name`, and can no longer be matched to a request in prose.

Closing the remaining 7,000 characters cannot come from the local side alone. The built-ins are 6,000 of the 17,000 and are not configurable. What is left on disk is six plugins and six local entries, and the three heaviest of those are `ponytail` (2,736 across six entries), `mattpocock-skills` (2,645 across eleven) and `caveman` (1,331 across four).

Note the interaction with the built-ins: they are heavy, they cannot be removed, and they compete in the same budget. Every character trimmed locally buys headroom for entries this repo actually cares about.

## What to do about it

**Trim the activation hooks first.** Now the top item, since the listing work is done. `ponytail` and `caveman` together inject ~6,800 characters of untruncatable text on every session start and every compaction, against 11,045 for the entire enabled listing. This is the only lever that pays on every compaction rather than once. Both plugins support intensity levels; a lighter level, or dropping one of the two, is a direct saving with no effect on the listing budget.

**Cut the heaviest breadcrumbs.** The top of the list as measured 2026-08-16:

| Entry                           | Chars | Source           |
| ------------------------------- | ----: | ---------------- |
| `ponytail:ponytail`             |   848 | plugin           |
| `meeting-summarizer`            |   721 | local, this repo |
| `install-agent-resources`       |   720 | local, this repo |
| `organize-with-comments`        |   610 | local, this repo |
| `ponytail:ponytail-review`      |   486 | plugin           |
| `mattpocock-skills:code-review` |   451 | plugin           |
| `ast-grep:ast-grep`             |   446 | plugin           |
| `ponytail:ponytail-audit`       |   428 | plugin           |
| `ponytail:ponytail-debt`        |   413 | plugin           |
| `caveman:caveman`               |   412 | plugin           |
| `caveman:compress`              |   357 | plugin           |

The six `ponytail` entries cost 2,736 and the four `caveman` entries 1,331, so those two plugins are a third of the listing. Only the locally-authored entries (`meeting-summarizer`, `install-agent-resources`, `organize-with-comments`) are directly editable here, and at 2,051 characters for three entries they are the cheapest remaining win: trim their trigger lists to distinctive keywords.

**Use `disable-model-invocation: true` deliberately.** It is the precise tool for this problem: an entry you always invoke by hand does not need a description in the auto-invocation listing at all, and the flag removes the breadcrumb while keeping the slash command working. Applied to 23 command entries and to the three `install-*` executor skills, which route through `install-agent-resources` and never need matching on their own. It is the only lever that reduces the listing without removing function.

**Remove rather than disable.** Disabling and not installing cost the same at session start, but a disabled plugin leaves reserve on disk plus a `false` entry to keep in step with the catalog. Five of the six rows in the disabled table were removed or demoted for that reason. Keep a plugin disabled only when it is wanted occasionally and its MCP servers rule out a partial install, which is why `chrome-devtools-mcp` is the one row left.

**Prefer project-scoped entries.** Applied: eight plugins and two skill bundles now live in the catalogs at project or local scope, and load only where a repo asks for them. That plus the removals accounts for 7,560 of the 9,887-character drop, the rest being the command trim finally showing up in a measurement. When adding anything new, the default question is which repos need it, not whether to enable it.

**Remember the body is free.** Splitting a skill into a lean breadcrumb plus a fat `SKILL.md` costs nothing until invocation, so descriptions are the only part worth cutting for context reasons. Once invoked, the rendered `SKILL.md` stays in context for the rest of the session and is not re-read on later turns.

## Reproducing these numbers

```
python3 scripts/context-budget/measure-context.py
```

Re-run whenever the enabled set changes. The figures here are a snapshot and drift as plugins are toggled and bundles re-resolve to latest on install. The script does not measure built-in skills or hook injections; those were measured by hand as described above.

Sources: [Claude Code skills docs](https://code.claude.com/docs/en/skills), [Agent Skills overview](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview).
