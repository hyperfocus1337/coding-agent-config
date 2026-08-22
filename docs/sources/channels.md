# Skill install channels

Skills reach an agent through four channels in this repo. Each is declared in a different place and installed by a different mechanism; this doc is the map of which is which. For any single channel, the file named under "Declared in" is the source of truth, not this page, so per-skill lists that drift (plugin bundles especially) are pointed at rather than duplicated.

## Channels

| Channel        | Declared in                                                 | Installed by                          | Agents      | Project scope                            |
| -------------- | ----------------------------------------------------------- | ------------------------------------- | ----------- | ---------------------------------------- |
| Local          | `dot_claude/skills/`                                        | chezmoi apply (plain files)           | Claude only | copy the dir, via `install-skills`       |
| Standalone CLI | `dot_claude/skills/install-skills/references/skills.json`   | vendor CLIs (playwright-cli, glab)    | Claude only | vendor `--path`, via `install-skills`    |
| Plugins        | `dot_claude/skills/install-plugins/references/plugins.json` | `claude plugin install`               | Claude only | `--scope project`, via `install-plugins` |
| APM bundle     | `apm.yml` (`dependencies.apm`)                              | `apm install` (re-resolves to latest) | Cross-agent | project `apm.yml`, via `install-skills`  |

Only the APM channel fans out to other agents (Gemini/Codex/Cursor) once their `targets:` are added. The other three are Claude-specific: local files land in `~/.claude`, and plugins/standalone CLIs register with Claude directly.

Every channel above declares user scope, which costs resident tokens in every session. The same channel installs into one repo instead, which costs tokens only there. The [`install-agent-resources`](../../dot_claude/skills/install-agent-resources/SKILL.md) skill is the entry point for that: it resolves a name against the three catalogs, then routes to `install-skills`, `install-plugins`, or `install-mcp`. It also routes to `install-bootstrap`, which installs no resource from a catalog: it writes the `SessionStart` hook that gives a cloud session this whole config. Per-resource reasoning lives in [`docs/scope/skills.md`](../scope/skills.md), [`docs/scope/plugins.md`](../scope/plugins.md), and [`docs/scope/mcp-servers.md`](../scope/mcp-servers.md).

## Local skills

Portable skills committed as plain files under [`dot_claude/skills/`](../../dot_claude/skills/) and laid into `~/.claude` by chezmoi: `meeting-summarizer`, `organize`, and the four install skills. Edit the files directly; there is no install step beyond `just chezmoi`.

## Standalone CLI skills

Installed by vendor CLIs because they ship with a companion binary. The set is declared in [`skills.json`](../../dot_claude/skills/install-skills/references/skills.json), which [`scripts/extensions/skills/install.sh`](../../scripts/extensions/skills/install.sh) reads:

- `playwright` installed via `playwright-cli install --skills`.
- `orbit` installed via `glab skills install orbit --path <skills dir>` (GitLab AI coding agents). Both rows are project-scope today, so the script installs neither at user scope.

## Plugin skills

Most skills arrive bundled inside Claude plugins. The full list, with the marketplace and upstream URL for each, lives in [`plugins.json`](../../dot_claude/skills/install-plugins/references/plugins.json), which [`scripts/extensions/plugins/install.sh`](../../scripts/extensions/plugins/install.sh) reads. That catalog is the source of truth; it is not mirrored here because the set changes often. Which plugins were considered for an APM move and why they stayed on the plugin CLI is covered in [`docs/research/plugin-migration.md`](../research/plugin-migration.md). The largest bundle is `mattpocock-skills` (25 engineering and productivity skills); its per-skill quick reference and the intended feature-build chain live in [`inventory.md`](inventory.md#matt-pocock-skills-mattpocock-skills).

## APM bundle skills

Third-party skills pulled from git bundles via `apm install`, declared under `dependencies.apm` in [`apm.yml`](../../apm.yml), which is the source of truth for which skills are pulled. `antonbabenko/terraform-skill` is flat, so the whole repo is taken as-is; `cursor/plugins/cursor-team-kit` names a `skills:` subset. Bundles that earn their tokens in one kind of repo only are not here: `neondatabase/agent-skills` (project) and `manaflow-ai/cmux` (local) are non-user rows in the install-skills catalog, installed per repo. The per-skill list with descriptions and upstream links lives in [`inventory.md`](inventory.md#by-apm-skill-bundles-apmyml).
