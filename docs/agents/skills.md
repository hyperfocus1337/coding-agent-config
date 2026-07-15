# Agent skills

Skills reach an agent through four channels in this repo. Each is declared in a different place and installed by a different mechanism; this doc is the map of which is which. For any single channel, the file named under "Declared in" is the source of truth, not this page, so per-skill lists that drift (plugin bundles especially) are pointed at rather than duplicated.

## Channels

| Channel        | Declared in                             | Installed by                          | Scope       |
|----------------|-----------------------------------------|---------------------------------------|-------------|
| Local          | `dot_claude/skills/`                    | chezmoi apply (plain files)           | Claude only |
| Standalone CLI | `scripts/extensions/skills/install.sh`  | vendor CLIs (playwright-cli, glab)    | Claude only |
| Plugins        | `scripts/extensions/plugins/install.sh` | `claude plugin install`               | Claude only |
| APM bundle     | `apm.yml` (`dependencies.apm`)          | `apm install` (re-resolves to latest) | Cross-agent |

Only the APM channel fans out to other agents (Gemini/Codex/Cursor) once their `targets:` are added. The other three are Claude-specific: local files land in `~/.claude`, and plugins/standalone CLIs register with Claude directly.

## Local skills

Portable skills committed as plain files under [`dot_claude/skills/`](../../dot_claude/skills/) and laid into `~/.claude` by chezmoi: `gh-cli`, `meeting-summarizer`, `organize`. Edit the files directly; there is no install step beyond `just chezmoi`.

## Standalone CLI skills

Installed by vendor CLIs because they ship with a companion binary, see [`scripts/extensions/skills/install.sh`](../../scripts/extensions/skills/install.sh):

- `playwright` — installed via `playwright-cli install --skills`.
- `orbit` — installed via `glab skills install --global orbit` (GitLab AI coding agents).

## Plugin skills

Most skills arrive bundled inside Claude plugins. The full list, with the marketplace and upstream URL for each, lives in [`scripts/extensions/plugins/install.sh`](../../scripts/extensions/plugins/install.sh) (each `claude plugin install` line is commented with its source repo). That script is the source of truth; it is not mirrored here because the set changes often. Which plugins were considered for an APM move and why they stayed on the plugin CLI is covered in [`docs/apm/plugin-migration.md`](../apm/plugin-migration.md).

## APM bundle skills (Matt Pocock)

The [`mattpocock/skills`](https://github.com/mattpocock/skills) bundle in [`apm.yml`](../../apm.yml) is deployed selectively: only the skills listed below are installed, by basename (they resolve across the bundle's category subdirs). APM re-resolves the bundle to latest upstream on every install (no lockfile), so this list is the source of truth for which skills are pulled, not a pinned snapshot. `antonbabenko/terraform-skill` is also pulled via APM as a flat skill bundle.

| Skill                                                                                        | SKILL.md                                                                                                                                                       |
|----------------------------------------------------------------------------------------------|----------------------------------------------------------------------------------------------------------------------------------------------------------------|
| [grilling](https://www.aihero.dev/skills-grilling)                                           | [productivity/grilling/SKILL.md](https://github.com/mattpocock/skills/blob/main/skills/productivity/grilling/SKILL.md)                                         |
| [grill-me](https://www.aihero.dev/skills-grill-me)                                           | [productivity/grill-me/SKILL.md](https://github.com/mattpocock/skills/blob/main/skills/productivity/grill-me/SKILL.md)                                         |
| [grill-with-docs](https://www.aihero.dev/skills-grill-with-docs)                             | [engineering/grill-with-docs/SKILL.md](https://github.com/mattpocock/skills/blob/main/skills/engineering/grill-with-docs/SKILL.md)                             |
| [codebase-design](https://www.aihero.dev/skills-codebase-design)                             | [engineering/codebase-design/SKILL.md](https://github.com/mattpocock/skills/blob/main/skills/engineering/codebase-design/SKILL.md)                             |
| [domain-modeling](https://www.aihero.dev/skills-domain-modeling)                             | [engineering/domain-modeling/SKILL.md](https://github.com/mattpocock/skills/blob/main/skills/engineering/domain-modeling/SKILL.md)                             |
| [wayfinder](https://www.aihero.dev/skills-wayfinder)                                         | [engineering/wayfinder/SKILL.md](https://github.com/mattpocock/skills/blob/main/skills/engineering/wayfinder/SKILL.md)                                         |
| [handoff](https://www.aihero.dev/skills-handoff)                                             | [productivity/handoff/SKILL.md](https://github.com/mattpocock/skills/blob/main/skills/productivity/handoff/SKILL.md)                                           |
| [improve-codebase-architecture](https://www.aihero.dev/skills-improve-codebase-architecture) | [engineering/improve-codebase-architecture/SKILL.md](https://github.com/mattpocock/skills/blob/main/skills/engineering/improve-codebase-architecture/SKILL.md) |
| [setup-matt-pocock-skills](https://www.aihero.dev/skills-setup-matt-pocock-skills)           | [engineering/setup-matt-pocock-skills/SKILL.md](https://github.com/mattpocock/skills/blob/main/skills/engineering/setup-matt-pocock-skills/SKILL.md)           |
| [tdd](https://www.aihero.dev/skills-tdd)                                                     | [engineering/tdd/SKILL.md](https://github.com/mattpocock/skills/blob/main/skills/engineering/tdd/SKILL.md)                                                     |
| [triage](https://www.aihero.dev/skills-triage)                                               | [engineering/triage/SKILL.md](https://github.com/mattpocock/skills/blob/main/skills/engineering/triage/SKILL.md)                                               |
| [to-tickets](https://www.aihero.dev/skills-to-tickets)                                       | [engineering/to-tickets/SKILL.md](https://github.com/mattpocock/skills/blob/main/skills/engineering/to-tickets/SKILL.md)                                       |
| [to-spec](https://www.aihero.dev/skills-to-spec)                                             | [engineering/to-spec/SKILL.md](https://github.com/mattpocock/skills/blob/main/skills/engineering/to-spec/SKILL.md)                                             |

To add or drop a Matt Pocock skill, edit the `skills:` list under `mattpocock/skills` in [`apm.yml`](../../apm.yml) and keep this table in sync.
