# Skills context budget

Every skill this repo installs contributes one line to the skill listing that Claude Code injects at session start: the skill name plus its frontmatter `description`. This "breadcrumb" is the only part loaded up front. The body of `SKILL.md`, its `references/`, `scripts/`, and any bundled files cost zero tokens until the skill is actually invoked, and scripts Claude runs never enter context at all, only their output does. So the standing cost of having a skill installed is just its breadcrumb, and this doc estimates that cost for the skills this repo puts on disk.

The numbers below come from measuring the `name` and `description` frontmatter of every installed `SKILL.md`, formatted as one listing line (`- name: description`) and counted at roughly four characters per token. Treat them as estimates: the tokenizer is not exactly four characters per token, and Claude Code compacts the real listing (see the budget section), so this is an upper bound on the raw material, not the exact wire cost.

## What actually loads

Skills reach this machine through the four channels in [`channels.md`](../sources/channels.md), but only two of them produce breadcrumbs: the APM bundle and local files land in `~/.claude/skills/`, and plugins carry their own `SKILL.md` files. A plugin is only counted if it is enabled in `settings.json` (`enabledPlugins`). Several plugins the repo installs ship subagents or commands rather than skills (`code-review`, `feature-dev`, `code-simplifier`, `code-refactoring`, `greenfield`, `pyright`), so they add nothing to the skills listing even though they cost against the separate agents and commands listings, which this doc does not measure.

### Enabled skills (loaded every session)

| Source                                                     | Skills |      Chars |    ~Tokens |
|------------------------------------------------------------|-------:|-----------:|-----------:|
| `~/.claude/skills` (APM bundle + local + terraform + neon) |     32 |      9,174 |      2,293 |
| `caveman@caveman`                                          |      9 |      2,496 |        622 |
| `ponytail@ponytail`                                        |      6 |      2,496 |        624 |
| `iterative-development@prime-radiant-marketplace`          |      6 |      1,638 |        410 |
| `astral@astral-sh` (ruff, ty, uv)                          |      3 |        446 |        111 |
| `codex@openai-codex`                                       |      3 |        426 |        106 |
| `ast-grep@ast-grep-marketplace`                            |      1 |        437 |        109 |
| `watch@claude-video`                                       |      1 |        345 |         86 |
| `context7@context7-marketplace`                            |      1 |        281 |         70 |
| `glab@gitlab-skills`                                       |      1 |         49 |         12 |
| **Total**                                                  | **63** | **17,788** | **~4,443** |

The `~/.claude/skills` row is the largest single source because it holds three channels at once: the 22-skill Matt Pocock APM bundle, the three local skills (`gh-cli`, `meeting-summarizer`, `organize`), and the standalone `terraform` and `neon` skills. The heaviest individual breadcrumbs live here too: a handful of document- and transcript-handling skills such as `meeting-summarizer` (~180 tokens) carry long trigger-keyword descriptions, and the top few together account for a disproportionate slice of the listing.

### Installed but disabled (on disk, not loaded)

These plugins are installed by [`scripts/extensions/plugins/install.sh`](../../scripts/extensions/plugins/install.sh) but switched off in `enabledPlugins`, so their breadcrumbs never reach context. They are the reserve cost that reappears the moment they are enabled.

| Source                                              | Skills |     Chars |    ~Tokens |
|-----------------------------------------------------|-------:|----------:|-----------:|
| `cloudflare@cloudflare`                             |     11 |     4,278 |      1,069 |
| `chrome-devtools-mcp@chrome-devtools-plugins`       |      6 |     1,594 |        398 |
| `notion-workspace-plugin@notion-plugin-marketplace` |      4 |     1,154 |        288 |
| **Total**                                           | **21** | **7,026** | **~1,755** |

Enabling all three would push the listing to 84 skills and roughly 6,200 tokens. The `cloudflare` bundle alone is larger than every plugin skill this repo currently loads combined, which is worth remembering before turning it on.

## The real constraint is truncation, not tokens

The token cost is small and linear: ~4,400 tokens at session start is a fraction of a percent of a 1M context window, and even fully loaded it stays under 7k. That is not the thing to worry about.

The constraint is the character budget on the listing itself. Claude Code scales that budget at roughly 1% of the model's context window: about 2,000 characters at 200k, about 10,000 at 1M. The listing always contains every skill name, but when the descriptions overflow the budget, Claude Code shortens them to fit, dropping description text starting with the skills invoked least so the ones used most keep their full keywords.

This repo's enabled listing is **17,788 characters**, which is roughly 9x the 200k budget and still comfortably past the 10,000-character budget of the 1M-context Opus this machine runs. So truncation is not a future risk here, it is already happening: the rarely-used skills have effectively lost their descriptions in the auto-invocation listing. They can still be called explicitly with `/skill-name` (names are never dropped), but Claude can no longer match them to a request from their description, because there is no description left to match against.

## What to do about it

The lever that matters is the number and verbosity of enabled skills, not their bodies. Concretely:

Keep descriptions tight and keyword-dense rather than narrative. The heaviest breadcrumbs, the ~180-token document- and transcript-handling skills like `meeting-summarizer`, are the highest-value targets: trimming their trigger lists to the distinctive keywords would recover a meaningful slice of the budget without hurting matching.

Leave heavy bundles disabled until needed. `cloudflare` (~1,070 tokens across 11 skills) is the single biggest swing available; the disabled table above is essentially a menu of what each toggle costs.

Prefer project-scoped skills for anything not used everywhere. A skill in a repo's `.claude/skills/` only loads in that repo, so it spends no budget in unrelated sessions. The user-level skills measured here load in every project on the machine.

Remember the body is free. Splitting a skill into a lean breadcrumb plus a fat `SKILL.md` body costs nothing until invocation, so long descriptions are the only part worth cutting for context reasons. Once a skill is invoked its rendered `SKILL.md` stays in context for the rest of the session and is not re-read on later turns.

## Reproducing these numbers

The counts come from parsing the `name` and `description` frontmatter of each installed `SKILL.md` under `~/.claude/skills/` and each enabled plugin's install path (from `~/.claude/plugins/installed_plugins.json`, filtered against `enabledPlugins` in `settings.json`), formatting each as `- name: description`, and counting characters directly with tokens estimated at length over four. Re-run the measurement whenever the enabled skill set changes; the figures here are a snapshot, and the enabled set drifts as plugins are toggled and the APM bundle re-resolves to latest on each install.

Sources: [Claude Code skills docs](https://code.claude.com/docs/en/skills), [Agent Skills overview](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview).
