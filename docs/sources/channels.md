# Skill install channels

Skills reach an agent through four channels in this repo. Each is declared in a different place and installed by a different mechanism; this doc is the map of which is which. For any single channel, the file named under "Declared in" is the source of truth, not this page, so per-skill lists that drift (plugin bundles especially) are pointed at rather than duplicated.

## Channels

| Channel        | Declared in                             | Installed by                          | Scope       |
| -------------- | --------------------------------------- | ------------------------------------- | ----------- |
| Local          | `dot_claude/skills/`                    | chezmoi apply (plain files)           | Claude only |
| Standalone CLI | `scripts/extensions/skills/install.sh`  | vendor CLIs (playwright-cli, glab)    | Claude only |
| Plugins        | `scripts/extensions/plugins/install.sh` | `claude plugin install`               | Claude only |
| APM bundle     | `apm.yml` (`dependencies.apm`)          | `apm install` (re-resolves to latest) | Cross-agent |

Only the APM channel fans out to other agents (Gemini/Codex/Cursor) once their `targets:` are added. The other three are Claude-specific: local files land in `~/.claude`, and plugins/standalone CLIs register with Claude directly.

## Local skills

Portable skills committed as plain files under [`dot_claude/skills/`](../../dot_claude/skills/) and laid into `~/.claude` by chezmoi: `gh-cli`, `meeting-summarizer`, `organize`. Edit the files directly; there is no install step beyond `just chezmoi`.

## Standalone CLI skills

Installed by vendor CLIs because they ship with a companion binary. The set is declared in [`skills.json`](../../dot_claude/skills/install-skills/references/skills.json), which [`scripts/extensions/skills/install.sh`](../../scripts/extensions/skills/install.sh) reads:

- `playwright` installed via `playwright-cli install --skills`.
- `orbit` installed via `glab skills install orbit --path <skills dir>` (GitLab AI coding agents). Both rows are project-scope today, so the script installs neither at user scope.

## Plugin skills

Most skills arrive bundled inside Claude plugins. The full list, with the marketplace and upstream URL for each, lives in [`plugins.json`](../../dot_claude/skills/install-plugins/references/plugins.json), which [`scripts/extensions/plugins/install.sh`](../../scripts/extensions/plugins/install.sh) reads. That catalog is the source of truth; it is not mirrored here because the set changes often. Which plugins were considered for an APM move and why they stayed on the plugin CLI is covered in [`docs/apm/plugin-migration.md`](../apm/plugin-migration.md). The largest bundle is `mattpocock-skills` (25 engineering and productivity skills); its per-skill quick reference and the intended feature-build chain live in [`inventory.md`](inventory.md#matt-pocock-skills-mattpocock-skills).

## APM bundle skills

Third-party skills pulled from git bundles via `apm install`, declared under `dependencies.apm` in [`apm.yml`](../../apm.yml), which is the source of truth for which skills are pulled. Both bundles (`antonbabenko/terraform-skill`, `neondatabase/agent-skills`) are flat, so the whole repo is taken as-is. The per-skill list with descriptions and upstream links lives in [`inventory.md`](inventory.md#by-apm-skill-bundles-apmyml).
