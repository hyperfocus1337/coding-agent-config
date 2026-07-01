# Which Claude plugins could move to APM

The MCP servers and Matt Pocock skills already live in [`apm.yml`](../../apm.yml). The 18 enabled Claude plugins stay on the `claude plugin` CLI. This doc classifies each for a *possible future* APM move. Not executed, reference only.

## Why not all of them

APM owns cross-agent primitives: MCP servers, skills, prompts, agents, instructions. It does **not** drive Claude's plugin marketplace, wire hooks into `settings.json`, or manage LSP bridges. So a plugin only moves cleanly if all its value is portable primitives (mostly skills/subagents). Anything relying on hooks, an LSP bridge, or bundled binaries has to stay.

## Classification

`SKILL-ONLY` = clean move. `MIXED` = skills migrate, some pieces don't. `TRUE-PLUGIN` = keep on Claude CLI.

| Plugin                  | Class       | Blocker / note                               |
| ----------------------- | ----------- | -------------------------------------------- |
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

Cleanest candidates: **ast-grep, glab, terraform-skill**, already agent-agnostic Agent Skills, so an APM move is near-lossless and buys cross-agent reuse.

The three MCP-centric TRUE-PLUGINs (context7-plugin, notion-workspace-plugin, cloudflare) could have just their *MCP server config* lifted into `apm.yml` if cross-agent MCP is wanted, at the cost of one-click marketplace install.

Everything else: leave on the `claude plugin` CLI. The hooks, LSP bridges, and bundled binaries are the point of those plugins and APM can't carry them.
