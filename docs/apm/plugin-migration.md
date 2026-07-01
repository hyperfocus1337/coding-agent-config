# Which Claude plugins could move to APM

The MCP servers and Matt Pocock skills already live in [`apm.yml`](../../apm.yml). The 18 enabled Claude plugins stay on the `claude plugin` CLI. This doc classifies each for a *possible future* APM move. Not executed, reference only.

## "APM supports plugins" vs "APM can carry this plugin"

APM's docs and `apm install --help` both say it supports Claude plugins ("APM packages, Claude skills (SKILL.md), and plugin collections (plugin.json)"). That is true, and it does not contradict the classification below. The two statements live on different layers.

**Format / consumption layer.** APM reads a `plugin.json`, synthesizes an `apm.yml` from its metadata, and treats the bundle as an ordinary APM package. It can install one (`apm install owner/repo/plugin-name`) and produce one (`apm pack --target claude` writes `plugin.json` at the bundle root). So APM can consume or emit *any* plugin's manifest.

**Functional deployment layer.** APM deploys by compiling *portable primitives* (skills, subagents, commands, MCP server config) into the harness directory (`.claude/` for Claude, plus `.cursor/`, `.codex/`, `.gemini/`, etc. per the resolved `targets:`). It does **not** register with Claude's plugin marketplace, wire hooks into `settings.json`, set up LSP bridges, or install bundled binaries.

So APM can consume the manifest of every plugin here, but for a plugin whose value *is* a hook, an LSP bridge, or a binary, consumption gets you the metadata and drops the function. Example: `apm install`-ing `watch` reads its `plugin.json` but never wires the SessionStart hook or the yt-dlp/ffmpeg binaries that are the whole point, so the install is inert.

The classes below are about which primitives survive the move and keep working, not about whether APM can read the file. A plugin moves cleanly only if all its value is portable primitives (mostly skills/subagents). Hooks, LSP bridges, and bundled binaries stay on the `claude plugin` CLI.

One MCP nuance worth recording: when a plugin declares no `mcpServers`, APM auto-discovers `.mcp.json` at the plugin root (then `.github/.mcp.json`), matching Claude Code. Self-defined MCP servers from direct dependencies are auto-trusted; transitive ones need `--trust-transitive-mcp`.

## Classification

`SKILL-ONLY` = clean move. `MIXED` = skills migrate, some pieces don't. `TRUE-PLUGIN` = keep on Claude CLI.

| Plugin                  | Class       | Blocker / note                               |
|-------------------------|-------------|----------------------------------------------|
| code-simplifier         | SKILL-ONLY  | just a subagent markdown                     |
| code-refactoring        | SKILL-ONLY  | subagents + commands, all portable           |
| ast-grep                | SKILL-ONLY  | Agent Skills open format already             |
| glab                    | SKILL-ONLY  | Agent Skills open format already             |
| terraform-skill         | SKILL-ONLY  | Agent Skills open format already             |
| code-review             | MIXED       | command-only, portable as APM prompt         |
| feature-dev             | MIXED       | 3 agents + 1 command, portable               |
| iterative-development   | MIXED       | skills lean on bundled Python helpers        |
| greenfield              | MIXED       | skills + agents + commands, multi-primitive  |
| astral                  | MIXED       | uv/ruff skills migrate; `ty` LSP does not    |
| caveman                 | MIXED       | ships MCP middleware + JS/Py runtime         |
| ponytail                | MIXED       | activation via Node.js hooks (APM weak spot) |
| pyright                 | TRUE-PLUGIN | Claude LSP wiring, no portable primitives    |
| context7-plugin         | TRUE-PLUGIN | MCP bridge (could move just the server)      |
| notion-workspace-plugin | TRUE-PLUGIN | hosted-MCP bridge                            |
| cloudflare              | TRUE-PLUGIN | 5 wired MCP servers are the point            |
| codex                   | TRUE-PLUGIN | SessionStart/Stop hooks + external CLI       |
| watch                   | TRUE-PLUGIN | SessionStart hook + yt-dlp/ffmpeg binaries   |

Counts: 5 SKILL-ONLY, 7 MIXED, 6 TRUE-PLUGIN.

## Recommendation

Cleanest candidates on paper: **ast-grep, glab, terraform-skill**, already agent-agnostic Agent Skills. In practice only terraform-skill survived the move on apm 0.23.1; ast-grep and glab hit tooling limits. See "What actually moved" below.

The three MCP-centric TRUE-PLUGINs (context7-plugin, notion-workspace-plugin, cloudflare) could have just their *MCP server config* lifted into `apm.yml` if cross-agent MCP is wanted, at the cost of one-click marketplace install.

Everything else: leave on the `claude plugin` CLI. The hooks, LSP bridges, and bundled binaries are the point of those plugins and APM can't carry them.

## What actually moved (attempted with apm 0.23.1)

Of the five, only **terraform-skill** moved cleanly. The other four hit real APM limits, so they stay on the `claude plugin` CLI. Findings below are from an actual attempt, not theory.

| Plugin           | APM source ref                                                   | Outcome                                                                                                                                                                                                                                                          |
|------------------|------------------------------------------------------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| terraform-skill  | `antonbabenko/terraform-skill#v1.17.1`                           | **Moved.** Flat `skill_bundle` repo (the `antonbabenko/agent-plugins` marketplace just points here). Deploys 1 skill, `--frozen` clean.                                                                                                                          |
| ast-grep         | `ast-grep/agent-skill`                                           | **Blocked.** Nested plugin layout (`ast-grep/skills/ast-grep/`); apm discovers 0 skills and deploys nothing, with or without a `skills:` subset.                                                                                                                 |
| glab             | `https://gitlab.com/gitlab-org/ai/skills.git`                    | **Blocked.** GitLab-hosted; `apm lock` records it but real `apm install --frozen` rejects it ("declared in apm.yml but missing from apm.lock.yaml"). Sync-check normalizes GitLab `repo_url` inconsistently. Note: `--frozen --dry-run` passes, masking the bug. |
| code-simplifier  | `anthropics/claude-plugins-official` → `plugins/code-simplifier` | **Skipped.** Single subagent in a ~40-plugin monorepo; APM clones the whole monorepo (13+ min observed) for one file.                                                                                                                                            |
| code-refactoring | `wshobson/agents` → `plugins/code-refactoring`                   | **Skipped.** Single subagent in a ~80-plugin monorepo; same clone cost.                                                                                                                                                                                          |

Lessons baked into `apm.yml`:

- A flat `skill_bundle` repo (skill or `skills/` at root) deploys with a bare `git:` entry. A `marketplace_plugin`-type repo needs a `skills:` subset, and even then apm only finds skills it can resolve to a top-level `skills/` dir. ast-grep buries its skill one level deeper, so apm sees none.
- `apm` validates every ref against the GitHub API: 60 req/hour unauthenticated, exhausted fast (refs then fail "not accessible or doesn't exist"). Authenticate with `GH_TOKEN=$(gh auth token)` before locking, especially in CI.
- Trust real `apm install --frozen`, not `--dry-run`: the dry-run sync-check is looser and passed the GitLab package that the real install rejected.
