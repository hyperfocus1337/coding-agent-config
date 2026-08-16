# Session-start context budget

Every skill, command and agent this machine installs contributes one line to a listing that Claude Code injects at session start: the entry's name plus its frontmatter `description`. This "breadcrumb" is the only part loaded up front. The body of `SKILL.md`, its `references/`, `scripts/`, and any bundled files cost zero tokens until the entry is actually invoked, and scripts Claude runs never enter context at all, only their output does.

This doc measures what that standing cost is. Numbers come from [`scripts/context-budget/measure-context.py`](../../scripts/context-budget/measure-context.py), which walks `~/.claude` plus every installed plugin, reconstructs the listings, and counts characters with tokens estimated at length over four. Snapshot taken 2026-08-16.

## What reaches the model, and what does not

A `SKILL.md`, command, or agent file on disk is not automatically a breadcrumb. Three filters apply. They were found by diffing the on-disk files against the listing a live session actually received.

A plugin manifest's `skills` array, when present, gates which on-disk skills register at all. `mattpocock-skills` ships 35 `SKILL.md` files but declares only 25 in `.claude-plugin/plugin.json`, so the other 10 (everything under `skills/in-progress/` and `skills/misc/`) are inert files.

`disable-model-invocation: true` keeps an entry out of the model-facing listing. It stays reachable as an explicit `/slash-command`, but Claude cannot auto-select it and never sees its description. Of `mattpocock-skills`' 25 declared skills, 14 carry this flag, so only 11 appear. The same mechanism trims `codex` from 7 commands to 2, and hides the local `thermo-nuclear-code-quality-review` skill (its twin in the agents listing is what shows up instead).

An entry with no `description` never reaches the listing, with one exception. A user-level command file with no frontmatter at all is still listed, using its H1 as the description: `commands/git/README.md` is not a command but shows up as `git:README: git slash commands`. Plugin command files in exactly the same shape (prompt bodies with an H1 and no frontmatter) were not observed in the listing, so the fallback appears to be user-level only. The measurement script encodes it that way and says so in a comment; if a future session shows plugin equivalents listed, that assumption is what to revisit.

Skills and commands share one listing block, so a command in `~/.claude/commands/` costs exactly what a skill of the same verbosity costs. Agents are a separate listing. Of this repo's 28 user-level commands, 23 carry the flag above and cost nothing; the other five are a real slice of the skills budget.

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

The skill and command listing alone is 41 entries and 11,045 characters; the agents listing adds 721.

Six plugins load in every session. The other rows in the plugin catalog carry project or local scope, so they cost nothing here and reach a repo through the `install-plugins` and `install-skills` skills.

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

`playwright-cli` is an orphan: installed 2026-07-21, and its row in `skills.json` carries project scope, so `skills/install.sh` does not install it at user scope. It is cheap at 95 characters, but a clean rebuild does not reproduce it, and nothing in this repo would notice.

**Commands, 5 listed entries, 202 characters.** All are authored here, under `dot_claude/commands/`:

| Entry          | Chars | Note                                                   |
| -------------- | ----: | ------------------------------------------------------ |
| `git:multiple` |    64 | listed                                                 |
| `git:pr`       |    37 | listed                                                 |
| `git:commit`   |    33 | listed                                                 |
| `git:README`   |    32 | H1 fallback, see below                                 |
| `git:push`     |    31 | listed                                                 |
| 23 others      |     0 | `disable-model-invocation: true`, reachable as `/name` |

`git:README` is documentation, not a command, and reaches the listing only through the no-frontmatter fallback. The repo copy carries the flag and the deployed copy in `~/.claude` does not, so `just chezmoi` takes those 32 characters out and leaves 4 entries at 165 characters.

**Agents, 2 entries, 487 characters.** `thermo-nuclear-code-quality-review` 301 and `ci-watcher` 186, both deployed by the `cursor-team-kit` APM entry. `apm.yml` notes there is no `agents:` subset key, so taking that kit's one skill means taking both agents. `codex` contributes a third, `codex-rescue`.

### What a command breadcrumb actually buys

Worth being precise, because it decides how aggressively to trim. A command in the listing is callable by the model through the Skill tool, not just by a human typing `/name`. That is verifiable from a live session: `- git:commit: Create a git commit` appears in the skill listing, and the Skill tool's contract accepts only names from that listing. The negative case confirms the mechanism, `codex`'s flagged commands and `mattpocock-skills`' flagged skills are absent from the same listing.

But callable is not the same as chosen. Asked to commit, Claude generally commits directly rather than routing through `/git:commit`, because the task is within its default competence. The breadcrumb only earns its cost when the command encodes a procedure Claude would otherwise improvise differently, and when the request arrives in prose rather than as an explicit slash command. By that test most commands here are hand-invoked tools whose descriptions are dead weight in the auto-invocation listing, and only a few (`git:commit`, `git:multiple`, `git:pr`, which pin this repo's commit and PR conventions) have a real claim to auto-selection.

### Which commands carry the flag

Every command in `dot_claude/commands/` except `git:commit`, `git:multiple`, `git:pr` and `git:push` carries `disable-model-invocation: true`, which keeps its breadcrumb out of the listing while leaving `/name` working. The four exceptions pin this repo's commit and PR conventions, which is exactly the case where auto-selection beats improvising:

| Flagged                                                   | Chars if listed | Reason                                                                                                                                |
| --------------------------------------------------------- | --------------: | ------------------------------------------------------------------------------------------------------------------------------------- |
| 8 × `organize:*`                                          |             984 | thin wrappers over the `organize-with-comments` skill, which already prompts for a style; the skill is the correct auto-invoke target |
| `issues:*` (3)                                            |             368 | each needs an issue number as an argument, so the request always arrives as a slash command                                           |
| `git:amend-author`, `git:amend-date`, `git:shift-dates`   |             279 | history surgery, never something to auto-select                                                                                       |
| `git:branches`, `git:worktrees`, `git:changelog`          |             365 | deliberate maintenance runs, invoked by hand at a moment of the user's choosing                                                       |
| `simple:explain`, `simple:proofread`, `simple:markitdown` |             192 | within default competence; the breadcrumb buys nothing the model cannot already do                                                    |
| `style:concise`, `style:current-state`                    |             136 | mode switches the user types explicitly                                                                                               |
| `summarize:transscripts`                                  |             102 | duplicates the `meeting-summarizer` skill (721 chars) on the same trigger                                                             |
| `git:README`                                              |              32 | documentation, listed only via the no-frontmatter fallback                                                                            |
| **Total**                                                 |       **2,458** |                                                                                                                                       |

`dot_claude/commands/README.md` carries the same flag. It is not deployed, and without the flag chezmoi would add it as another H1-fallback entry.

### Not on disk, still charged

Two costs the script cannot see, measured separately:

Claude Code's own built-in skills (`dataviz`, `claude-api`, `artifact-*`, `update-config`, `code-review`, `simplify`, `loop`, `schedule`, `run`, `init`, `security-review`, `keybindings-help`, `fewer-permission-prompts`) add 15 entries and roughly **6,000 characters**. Two of them dominate: `dataviz` at 1,182 characters and `claude-api` at 1,086. These are not configurable from this repo, but they are the single largest block competing for the same listing budget.

`SessionStart` hooks inject plain text straight into the conversation, which is not a listing and is never truncated. `ponytail` injects its full mode description at roughly **5,100 characters** on every startup, resume, clear and compact; `caveman` adds about **1,700**. That is **~6,800 characters (~1,700 tokens)** of instruction text per session, more than any single plugin's breadcrumbs and more than double `ponytail`'s own listing cost. It also re-fires on compaction, so a long session pays it repeatedly.

Those two hooks are the largest single cost on this machine, worth **58% of what the whole enabled listing costs**, and no scope decision touches them.

For comparison, the whole `CLAUDE.md` plus its five `rules/` files total 3,071 characters. The activation hooks cost more than twice the hand-written instructions.

### Installed but disabled (on disk, not loaded)

Reserve cost that reappears the moment these are switched on in `enabledPlugins`. One plugin is in this state:

| Source                                        | Skills |  Cmds | Agents |     Chars |  ~Tokens |
| --------------------------------------------- | -----: | ----: | -----: | --------: | -------: |
| `chrome-devtools-mcp@chrome-devtools-plugins` |      6 |     0 |      0 |     1,733 |      433 |
| **Total**                                     |  **6** | **0** |  **0** | **1,733** | **~433** |

It is installed and disabled for one reason: a plugin's MCP servers cannot be disabled individually, so disabling the whole plugin is the only lever short of uninstalling it. See [`docs/mcp/disabling-servers.md`](../mcp/disabling-servers.md).

### Consistency check

Three views of the plugin set agree: the catalog holds seven `scope: "user"` rows, `settings.json` holds seven `enabledPlugins` entries (six `true`, one `false`), the machine has seven plugins installed, and every marketplace in `extraKnownMarketplaces` backs a catalog row. The measurement script warns when a plugin is enabled but missing from `installed_plugins.json`, which is how a mismatch surfaces.

context7 reaches Claude through exactly one channel, the user-scoped MCP server that APM installs from `apm.yml`. A session shows one instruction block and one tool set, `mcp__context7__*`.

## The real constraint is truncation, not tokens

Token cost is small and linear. Roughly 2,900 tokens of listings from disk, plus ~1,500 for the built-ins and ~1,700 for hook injections, is well under 1% of a 1M context window.

The constraint is the character budget on the listing itself. Claude Code scales that at roughly 1% of the model's context window: about 2,000 characters at 200k, about 10,000 at 1M. The listing always contains every name, but when the descriptions overflow, Claude Code shortens them to fit, dropping description text starting with the entries invoked least so the ones used most keep their keywords.

This machine's skill and command listing is **11,045 characters from disk plus ~6,000 from built-ins**, so about 17,000 against a 10,000-character budget on the 1M-context Opus this machine runs, roughly 1.7x over. Truncation is not a future risk, it is happening: rarely-used entries lose their descriptions in the auto-invocation listing, stay callable as `/name`, and cannot be matched to a request in prose.

Closing the 7,000-character gap cannot come from the local side alone. The built-ins are 6,000 of the 17,000 and are not configurable. What sits on disk is six plugins and six local entries, and the three heaviest are `ponytail` (2,736 across six entries), `mattpocock-skills` (2,645 across eleven) and `caveman` (1,331 across four).

## What to do about it

**Trim the activation hooks first.** `ponytail` and `caveman` together inject ~6,800 characters of untruncatable text on every session start and every compaction, against 11,045 for the entire enabled listing. This is the only lever that pays on every compaction rather than once. Both plugins support intensity levels; a lighter level, or dropping one of the two, is a direct saving with no effect on the listing budget.

**Cut the heaviest breadcrumbs.** The top of the list:

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

The six `ponytail` entries cost 2,736 and the four `caveman` entries 1,331, so those two plugins are a third of the listing. Only the locally-authored entries (`meeting-summarizer`, `install-agent-resources`, `organize-with-comments`) are editable here, and at 2,051 characters for three entries they are the cheapest available win: trim their trigger lists to distinctive keywords.

**Use `disable-model-invocation: true` deliberately.** It is the precise tool for this problem: an entry you always invoke by hand does not need a description in the auto-invocation listing at all, and the flag removes the breadcrumb while keeping the slash command working. It covers 23 command entries and the three `install-*` executor skills, which route through `install-agent-resources` and never need matching on their own. It is the only lever that reduces the listing without removing function.

**Remove rather than disable.** Disabling and not installing cost the same at session start, but a disabled plugin holds reserve on disk plus a `false` entry to keep in step with the catalog. Keep a plugin disabled only when it is wanted occasionally and its MCP servers rule out a partial install, which is the case for `chrome-devtools-mcp`.

**Prefer project-scoped entries.** A skill in a repo's `.claude/skills/` loads only in that repo. Eight plugins and two skill bundles sit in the catalogs at project or local scope for that reason, and the `install-plugins` and `install-skills` skills put them into the repos that need them. For anything new, the question is which repos need it, not whether to enable it.

**Remember the body is free.** Splitting a skill into a lean breadcrumb plus a fat `SKILL.md` costs nothing until invocation, so descriptions are the only part worth cutting for context reasons. Once invoked, the rendered `SKILL.md` stays in context for the rest of the session and is not re-read on later turns.

## Reproducing these numbers

```
python3 scripts/context-budget/measure-context.py
```

Re-run whenever the enabled set changes. The figures here are a snapshot and drift as plugins are toggled and bundles re-resolve to latest on install. The script does not measure built-in skills or hook injections; those were measured by hand as described above.

Sources: [Claude Code skills docs](https://code.claude.com/docs/en/skills), [Agent Skills overview](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview).
