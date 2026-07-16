# Sharing skills and instructions between Claude Code and Codex

Claude Code cannot discover Codex's `.agents/` convention natively, and there is no `skillsPath` or `CLAUDE_SKILLS_PATH` setting to point it elsewhere. Its discovery paths are hardcoded. This is the map of where each tool actually looks, and what works today to share content across both without maintaining two copies.

## Where each tool looks

| Thing          | Claude Code                                           | Codex                                                                                                                       |
|----------------|-------------------------------------------------------|-----------------------------------------------------------------------------------------------------------------------------|
| Instructions   | `CLAUDE.md` (project, `~/.claude/`)                   | `AGENTS.md` (repo root up, `~/.codex/AGENTS.md`)                                                                            |
| Skills         | `.claude/skills/<name>/SKILL.md`, `~/.claude/skills/` | `.agents/skills`, scanned every directory from cwd up to repo root, plus `$HOME/.agents/skills/` (and `/etc/codex/skills/`) |
| Slash commands | `.claude/commands/*.md` (now merged into skills)      | `$CODEX_HOME/prompts/*.md`, user-level only                                                                                 |
| Rules          | `.claude/rules/`                                      | no equivalent, folded into AGENTS.md                                                                                        |
| Config         | `.claude/settings.json`                               | `~/.codex/config.toml`                                                                                                      |

Pointing Claude at a custom skills directory has been requested repeatedly and declined. The canonical request, [#18621](https://github.com/anthropics/claude-code/issues/18621) (add an option to configure the skills path), was closed `not planned` in March 2026. [#22902](https://github.com/anthropics/claude-code/issues/22902), which asks for exactly this without symlinks or plugin setup, was closed as a duplicate of it. [#33957](https://github.com/anthropics/claude-code/issues/33957), which notes symlinks from `~/.claude/skills/` to another directory are not followed by the scanner, was folded into [#14836](https://github.com/anthropics/claude-code/issues/14836). Net effect: no `skillsPath` or `additionalSkillsPaths` setting exists, and none is on the roadmap, so the workarounds below are the state of the art.

## What works today

**Instructions: solved.** Put everything in `AGENTS.md` and make `CLAUDE.md` a one-line pointer to it. Codex reads `AGENTS.md` natively; it can also go the other way with `project_doc_fallback_filenames = ["CLAUDE.md"]` in `config.toml`.

**Skills, option A: symlink per skill, not per directory.** Symlinking `.claude/skills` itself gets skipped by the scanner, but individual skill folders inside a real `.claude/skills/` resolve fine:

```
.agents/skills/deploy/SKILL.md      # source of truth
.claude/skills/deploy -> ../../.agents/skills/deploy
```

Codex supports this direction too and follows the symlink target when scanning. Downside is one symlink per skill committed to git, and Windows needs Developer Mode.

**Skills, option B: wrap `.agents/` in a local plugin.** Put `.claude-plugin/plugin.json` at the repo root with `"skills": ["./.agents/skills/"]` and load it with `--plugin-dir .`. No symlinks, but skills become namespaced as `/plugin-name:skill-name`, which breaks any cross-references.

**Slash commands: skip.** Codex prompts are user-scoped only and use a different invocation model (`$skill` vs `/command`). Not worth unifying.

## Recommendation for this repo

Given how much already lives in chezmoi, the symlink approach fits best: `.agents/` as the real content, `.claude/` as a thin shim of links, both committed.
