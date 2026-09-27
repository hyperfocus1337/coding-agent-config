# Session-start context budget

Every skill, command and agent that this machine installs adds one line to a listing that Claude Code injects at session start.
The line holds the entry name plus its frontmatter `description`, and this "breadcrumb" is the only part that loads at the start.
The body of `SKILL.md`, its `references/`, `scripts/`, and other bundled files cost zero tokens until the entry is invoked.
Scripts that Claude runs never enter context, only their output does.

This page measures that standing cost.
The numbers come from [`scripts/context-budget/measure-context.py`](../../../scripts/context-budget/measure-context.py).
The script walks `~/.claude`, the claude.ai skills synced into `~/.claude/skills/synced/`, and every installed plugin.
It skips `~/.claude/skills/.trash/`, which holds skills that do not load.
It reconstructs the listings and counts characters, with tokens estimated as length divided by four.

Snapshot taken 2026-09-27 on Claude Code 2.1.283.
The script total, 29 entries, matches the skill listing that a live session received on that date.

## What reaches the model, and what does not

A `SKILL.md`, command, or agent file on disk does not always become a breadcrumb.
The filters below were found by comparing the files on disk with the listing that a live session received.

A plugin manifest's `skills` array, when present, controls which skills on disk register.
`mattpocock-skills` ships 35 `SKILL.md` files but declares only 25 in `.claude-plugin/plugin.json`.
The other 10, 6 under `skills/in-progress/` and 4 under `skills/misc/`, do not load.

`disable-model-invocation: true` keeps an entry out of the model-facing listing.
The entry stays available as an explicit `/slash-command`, but Claude cannot select it automatically and never sees its description.
Of the 25 skills that `mattpocock-skills` declares, 14 carry this flag, so only 11 appear.
The same flag hides the local `thermo-nuclear-code-quality-review` skill; only its twin in the agents listing appears.

A user-level skill is listed under its directory name, not its frontmatter `name`.
`~/.claude/skills/organize/` has `name: organize-with-comments`, and the listing shows `organize`.

A user-level command file with no `description` is listed with its H1 as the description.
`.chezmoiignore` keeps every `commands/**/README.md` out of `~/.claude` for this reason, and the repo copies also carry `disable-model-invocation: true`.
A live listing showed no plugin command file of the same shape, so the script applies the H1 fallback to user-level files only.
No enabled plugin has such a file.

When `syncClaudeAiSkills` is on, skills from the claude.ai account are listed as `anthropic-skills:<name>`.
Claude Code keeps one bucket per organization under `~/.claude/skills/synced/`, and one name can occur in two buckets.
The live listing held each name once.
`meeting-summarizer` is flagged in the older bucket and not flagged in the newer one, and the listing showed it.
The script therefore takes each name from the most recently updated bucket.

Skills and commands share one listing block, so a command in `~/.claude/commands/` costs the same as a skill with the same description length.
Agents are a separate listing.

## Cost per source

### Enabled (loaded every session)

| Source                                 | Skills |  Cmds | Agents |     Chars |    ~Tokens |
| -------------------------------------- | -----: | ----: | -----: | --------: | ---------: |
| `~/.claude` (see breakdown below)      |      5 |     9 |      2 |     3,694 |        924 |
| `mattpocock-skills@mattpocock`         |     11 |     0 |      0 |     2,645 |        661 |
| `astral@astral-sh`                     |      3 |     0 |      0 |       473 |        118 |
| `ast-grep@ast-grep-marketplace`        |      1 |     0 |      0 |       447 |        112 |
| claude.ai synced (`anthropic-skills:`) |      0 |     0 |      0 |         0 |          0 |
| **Total from disk**                    | **20** | **9** |  **2** | **7,259** | **~1,815** |

The skill and command listing alone is 29 entries and 6,770 characters.
The agents listing adds 489.

Five plugins are enabled.
`pyright-lsp` and `typescript-lsp` add language servers and no breadcrumbs, so they have no row.
`codex@openai-codex` is installed but set to `false` in `enabledPlugins`, so its 838 characters are on disk only.
The other plugins in the catalog have project or local scope, so they cost nothing here.
The `install-plugins` and `install-skills` skills add them to the repos that need them.

### The claude.ai synced row

`dot_claude/settings.json` sets `syncClaudeAiSkills: false`.
With this setting, Claude Code does not load the claude.ai account skills and moves the files from `~/.claude/skills/synced/` to `~/.claude/skills/.trash/`.
The session of 2026-09-27 listed no `anthropic-skills:` entry.
When the setting is `false`, the script counts no entries for this row.

Claude Code downloads the skills enabled for the claude.ai account into `~/.claude/skills/synced/` when a terminal session signs in with that account.
Anthropic's `pdf` and `xlsx` always sync; the other skills sync when they are turned on in the claude.ai skill settings.
This repo does not declare these skills, and chezmoi does not manage the folder.

With the sync on, this account syncs 16 skills with 11,773 characters, measured on 2026-09-26.
That is more than the 6,770 characters of all other listed entries together.

| Skill                          | Chars | Use in a terminal session                                     |
| ------------------------------ | ----: | ------------------------------------------------------------- |
| `docs`                         | 1,004 | needs the claude.ai docs connector                            |
| `pptx`                         |   985 | file format skill                                             |
| `google-workspace`             |   982 | needs Google connectors                                       |
| `xlsx`                         |   975 | file format skill                                             |
| `computer-use`                 |   969 | needs the desktop app's `computer-use` tools                  |
| `docx`                         |   959 | file format skill                                             |
| `built-in-browser`             |   856 | needs the desktop app's browser pane                          |
| `chrome-browser`               |   786 | needs the Claude in Chrome extension tools                    |
| `meeting-summarizer`           |   738 | same task as the local `meeting-summarizer`, which is flagged |
| `deep-research`                |   604 | research across sources with subagents                        |
| `pdf`                          |   461 | file format skill                                             |
| `morning`                      |   367 | morning brief artifact                                        |
| `skill-creator`                |   353 | skill authoring and evals                                     |
| `import-memory`                |   173 | memory import from another assistant                          |
| 2 organization-specific skills | 1,545 | organization variants of `docx` and `pptx`                    |

A terminal session on this machine has none of the tools that `computer-use`, `built-in-browser`, `chrome-browser`, `google-workspace` and `docs` need.
`disableClaudeAiConnectors` is also `true`.
With the sync on, those five skills cost 4,597 characters in every session and cannot run here.

### What is in the `~/.claude` row

This row holds the local sources that this repo controls.
The figures per entry are the rendered breadcrumb (`- name: description`) without its trailing newline.
For this reason, each group sum is one character per entry lower than the table total.

**Skills: 5 listed entries, 2,642 characters.**
Twelve skill directories sit in `~/.claude/skills/`, not counting `.trash/`.
Seven carry `disable-model-invocation: true` and cost nothing:

| Channel                                     | Listed | Chars | Detail                                                                                                                                                                          |
| ------------------------------------------- | -----: | ----: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Local, authored here (`dot_claude/skills/`) |      4 | 2,398 | `install-agent-resources` 862, `organize` 596, `technical-writing` 528, `markitdown` 412                                                                                        |
| APM, `antonbabenko/terraform-skill`         |      1 |   239 | `terraform-skill`                                                                                                                                                               |
| Flagged, not listed                         |      7 |     0 | `meeting-summarizer` 721, `install-bootstrap` 573, `install-skills` 423, `install-mcp` 372, `install-plugins` 359, `thermo-nuclear-code-quality-review` 291, `explain-diff` 122 |

The four `install-*` executors carry the flag because `install-agent-resources` is the single entry point that routes to them.
Only the router needs a breadcrumb.
`thermo-nuclear-code-quality-review` comes from the `cursor/plugins/cursor-team-kit` APM entry, which also deploys the kit's two agents.

**Commands: 9 listed entries, 563 characters, all declared here.**
Fifty-nine command files sit in `~/.claude/commands/`, the same set that `dot_claude/commands/` declares without its README files.
Fifty carry the flag.
Chezmoi writes what the source declares and deletes nothing else.
A renamed or deleted command therefore stays in `$HOME` and still costs listing space, so run the script again after a rename.

| Entry                     | Chars | Note                                                   |
| ------------------------- | ----: | ------------------------------------------------------ |
| `chezmoi`                 |   115 | listed                                                 |
| `git:commit:conversation` |    79 | listed                                                 |
| `git:push`                |    77 | listed                                                 |
| `git:commit:extend`       |    57 | listed                                                 |
| `git:commit:multiple`     |    57 | listed                                                 |
| `git:commit:single`       |    47 | listed                                                 |
| `git:commit:task`         |    44 | listed                                                 |
| `git:pr:create`           |    44 | listed                                                 |
| `git:commit:push`         |    34 | listed                                                 |
| 50 others                 |     0 | `disable-model-invocation: true`, available as `/name` |

`/answer:caveman` carries the flag.
Its 52-character breadcrumb stays out of the listing, and the 1,769 characters of the file cost nothing until the command runs.

**Agents: 2 entries, 489 characters.**
`thermo-nuclear-code-quality-review` 301 and `ci-watcher` 186, both deployed by the `cursor-team-kit` APM entry.
`apm.yml` notes that there is no `agents:` subset key, so the kit's one skill comes with both agents.
With `codex` disabled, its `codex-rescue` agent is not listed.

### What a command breadcrumb buys

A command in the listing is callable by the model through the Skill tool, not only by a human who types `/name`.
A live session shows this: `- git:commit:single: Create a single git commit` is in the skill listing, and the Skill tool accepts only names from that listing.
The flagged `mattpocock-skills` skills are not in the same listing, which confirms the mechanism.

Callable does not mean chosen.
When asked to commit, Claude usually commits directly and does not route through `/git:commit:single`, because the task is within its default competence.
A breadcrumb is worth its cost only when two conditions are true:

- The command encodes a procedure that Claude would otherwise do differently.
- The request arrives in prose, not as an explicit slash command.

The listed `git:*` commands pin this repo's commit, push and PR conventions, so they meet both conditions.

### Which commands carry the flag

Every command in `dot_claude/commands/` except the nine above carries `disable-model-invocation: true`.
The flag keeps the breadcrumb out of the listing, and `/name` still works.

| Flagged                                                             | Chars if listed | Reason                                                                                                                   |
| ------------------------------------------------------------------- | --------------: | ------------------------------------------------------------------------------------------------------------------------ |
| 9 × `organize:*`                                                    |           1,055 | thin wrappers over the `organize` skill, which asks for a style; the skill is the correct target for automatic selection |
| 8 × `docs:*`                                                        |             782 | rewrite modes that take pasted prose or paths as the argument                                                            |
| 8 × `answer:*`, 2 × `ask:*`                                         |             788 | mode switches that the user types explicitly                                                                             |
| `git:branches:cleanup`, `git:changelog`, `git:worktrees:*` (2)      |             593 | maintenance runs, invoked by hand at a time the user chooses                                                             |
| `code:cleanup:dead-code`                                            |              85 | a cleanup run that deletes code, started by hand                                                                         |
| 5 × `code:review:*`, 2 × `code:security:*`                          |             393 | focused reviews, started by hand                                                                                         |
| `git:rewrite:author`, `git:rewrite:date`, `git:rewrite:shift-dates` |             291 | history changes, never something to select automatically                                                                 |
| `issues:*` (2)                                                      |             270 | each needs an issue number as an argument, so the request always arrives as a slash command                              |
| `git:commit:any`, `git:commit:split`, `git:revert`                  |             187 | `any` routes to the listed commit commands; `split` and `revert` change commits already made                             |
| `summarize:transcripts`                                             |             101 | a standalone prompt for the same task as the flagged `meeting-summarizer` skill                                          |
| `code:explain`, `text:proofread`                                    |              84 | within default competence; the breadcrumb adds nothing that the model cannot already do                                  |
| **Total**                                                           |       **4,629** |                                                                                                                          |

`dot_claude/commands/README.md` and the README in each namespace folder carry the same flag, and `.chezmoiignore` keeps them out of `~/.claude`.
Either guard alone is sufficient; the README files are documentation, not commands.

### Not on disk, still charged

The script does not see the costs below, so they were measured separately.

Claude Code's bundled skills cost nothing.
`disableBundledSkills: true` in `dot_claude/settings.json` removes them, and the session of 2026-09-27 listed no bundled skill.
Without that setting, they add 15 entries and about 6,000 characters, with `dataviz` at 1,182 and `claude-api` at 1,086.
[`disabled-tools.md`](disabled-tools.md) lists what the setting removes.

`SessionStart` hooks inject plain text directly into the conversation.
That text is not a listing, is never truncated, and fires again on every startup, resume, clear and compaction.
A hook that injects instruction text is therefore the most expensive form a directive set can take.
No enabled plugin on this machine has a `SessionStart` hook.
The disabled `codex` plugin declares `SessionStart`, `SessionEnd` and `Stop` hooks, so measure its injection before you enable it.
This repo authors its instruction text as files: [`rules/code.md`](../../../dot_claude/rules/code.md) is 1,427 characters loaded once per session, and [`commands/answer/caveman.md`](../../../dot_claude/commands/answer/caveman.md) is 1,769 characters loaded only when `/answer:caveman` runs.

Before you install a plugin that ships a `SessionStart` hook, measure what it injects and check whether it can be silenced.
Give the hook a payload and count the bytes:

```sh
echo '{"session_id":"t","hook_event_name":"SessionStart","source":"startup"}' \
  | CLAUDE_PLUGIN_ROOT="$P" node "$P/hooks/<activate>.js" | wc -c
```

Some hooks read an environment variable that stops the injection.
This keeps the plugin's skills available and reduces the text to a few bytes.
Many hooks do not, and for those the only option is to not install the plugin.
A hook that also injects on `SubagentStart` charges the same text for each subagent.

`CLAUDE.md` plus its three `rules/` files total 3,971 characters, the full standing instruction load in every repo.
In this repo, the project rule `.claude/rules/apply.md` adds 959 characters.

### Consistency check

The views of the plugin set agree:

- The catalog in `install-plugins/references/plugins.json` holds six `scope: "user"` rows.
- `settings.json` holds six `enabledPlugins` entries: five `true`, and `codex@openai-codex` `false`.
- `installed_plugins.json` holds the same six plugins.
- Each of the 12 marketplaces in `extraKnownMarketplaces` backs a catalog row.

The measurement script warns when a plugin is enabled but not in `installed_plugins.json`, which is how a mismatch shows.

context7 reaches Claude through one channel: the user-scoped MCP server that APM installs from `apm.yml`.
A session shows one instruction block and one tool set, `mcp__context7__*`.

## The listing fits its budget

The token cost is small and linear.
About 1,800 tokens of listings from disk is below 0.2% of a 1M context window.

The listing also has a size budget.
The [Claude Code skills docs](https://code.claude.com/docs/en/skills#skill-descriptions-are-cut-short) set it at 1% of the model's context window, through `skillListingBudgetFraction` (default `0.01`).
The listing always contains every name.
When the descriptions overflow the budget, Claude Code removes descriptions, starting with the least-invoked skills.
A skill without a description is still available as `/name`, but Claude cannot match it to a request in prose.
Each description is also cut at 1,536 characters (`skillListingMaxDescChars`); the longest breadcrumb here, `install-agent-resources`, is 862 characters.

The docs do not give the unit of the budget.
A session with the claude.ai skills synced received all 46 descriptions in full, at 18,584 characters, on the 1M-context Opus model that this machine runs.
Thus the budget on that model is more than 18,584 characters.
This agrees with a budget in tokens: 1% of 1M is 10,000 tokens, about 40,000 characters at four characters per token.

Read as characters, the budget on a 200k-context model is about 8,000 characters, and the listing of 6,770 characters fits it.
To see the size after the budget, run `/context`: in Claude Code 2.1.196 and later, its Skills row reports what the model receives.

## What to do about it

**Keep instruction text out of `SessionStart` hooks.**
A hook injection cannot be truncated and fires again on every session start and every compaction.
It is the one cost that increases with session length, not paid once.
An installed plugin that injects 5,000 characters of behavioral rules costs more than its own breadcrumbs several times over.
If such a rule set is necessary, author it here: a condensed version is 20 to 30 percent of the injected size, and `disable-model-invocation: true` keeps the opt-in half out of the listing.
[`instruction-load.md`](instruction-load.md) covers what a directive set costs in adherence and how to condense one.

**Keep the synced claude.ai skills off.**
`syncClaudeAiSkills: false` keeps 16 entries and 11,773 characters out of the listing, including `pdf`, `xlsx`, `docx` and `pptx`.
If one of these skills is necessary, turn the sync on and use a narrower lever:

1. Turn the other skills off in the claude.ai skill settings. The next sync removes them from `~/.claude/skills/synced/`. This also removes them from Cowork and cloud sessions.
2. Set the other skills to `"name-only"` or `"off"` in `skillOverrides` in `dot_claude/settings.json`. The docs exclude only plugin skills from `skillOverrides`, so this should apply to synced skills; check it with `/skills`.

**Cut the heaviest breadcrumbs.**
The ten heaviest entries:

| Entry                               | Chars | Source                          |
| ----------------------------------- | ----: | ------------------------------- |
| `install-agent-resources`           |   862 | local, this repo                |
| `organize`                          |   596 | local, this repo                |
| `technical-writing`                 |   528 | local, this repo                |
| `mattpocock-skills:code-review`     |   451 | `mattpocock-skills@mattpocock`  |
| `ast-grep:ast-grep`                 |   446 | `ast-grep@ast-grep-marketplace` |
| `markitdown`                        |   412 | local, this repo                |
| `mattpocock-skills:wizard`          |   341 | `mattpocock-skills@mattpocock`  |
| `mattpocock-skills:codebase-design` |   302 | `mattpocock-skills@mattpocock`  |
| `mattpocock-skills:research`        |   268 | `mattpocock-skills@mattpocock`  |
| `mattpocock-skills:domain-modeling` |   253 | `mattpocock-skills@mattpocock`  |

The four heaviest entries that this repo can edit are `install-agent-resources` 862, `organize` 596, `technical-writing` 528 and `markitdown` 412: 2,398 characters in total, 35% of the listing.
Trim their trigger lists to keywords that no other entry uses.
With the sync off, the flag on the local `meeting-summarizer` keeps its 721 characters out of the listing.

**Use `disable-model-invocation: true` deliberately.**
An entry that you always invoke by hand does not need a description in the listing.
The flag removes the breadcrumb and keeps the slash command.
It covers 50 command entries, the four `install-*` executor skills, `explain-diff` and `meeting-summarizer`.
For entries whose files you do not edit, `skillOverrides` with `"user-invocable-only"` has the same effect.

**Remove rather than disable.**
A disabled plugin and a plugin that is not installed cost the same at session start.
But a disabled plugin stays on disk and keeps a `false` entry that must stay in step with the catalog.
`codex` is in this state.
A plugin that is necessary only sometimes belongs at project or local scope, where it loads only in the repo that needs it.

**Prefer project-scoped entries.**
A skill in a repo's `.claude/skills/` loads only in that repo.
Eight plugins and five skill entries sit in the catalogs at project or local scope for that reason.
For each entry that you add, the question is which repos need it, not whether to enable it.

**Remember that the body is free.**
A skill split into a short breadcrumb plus a long `SKILL.md` costs nothing more until it is invoked, so descriptions are the only part to cut for context.
After invocation, the rendered `SKILL.md` stays in context for the rest of the session and is not read again on later turns.

## Reproducing these numbers

```sh
python3 scripts/context-budget/measure-context.py
```

Run it again when the enabled set changes.
The figures drift when plugins are toggled, when bundles resolve to the latest version on install, and when the claude.ai account syncs.
The script does not measure bundled skills or hook injections; those were measured by hand as described above.

Sources: [Claude Code skills docs](https://code.claude.com/docs/en/skills), [Claude Code settings reference](https://code.claude.com/docs/en/settings-reference), [Agent Skills overview](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview).
