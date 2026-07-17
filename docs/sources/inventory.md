# Install source inventory

The companion to [`phases.md`](../sdlc/phases.md). Where `phases.md` answers "which tool for which phase", this page answers "where did each tool come from": installed manually, by an APM skill bundle, by a standalone CLI, by a Claude plugin, or built into Claude Code. The source of truth for each channel is the file named in that section's intro, not this page, since the sets drift over time.

Every tool is shown in a table. The `Kind` column distinguishes a slash `command`, a `skill`, a `subagent`, an `MCP` server, or an `LSP` server, since one plugin often ships several.

## Manually committed (chezmoi, this repo)

Plain files committed under `dot_claude/` and laid into `~/.claude` by `just chezmoi`. Slash commands live in [`dot_claude/commands/`](../../dot_claude/commands/README.md); local skills in [`dot_claude/skills/`](../../dot_claude/skills/). No install step beyond `just chezmoi`.

| Item                             | Kind    | Description                                                                        |
|----------------------------------|---------|------------------------------------------------------------------------------------|
| `/git:commit`                    | command | Create a git commit (stage all, single commit).                                    |
| `/git:multiple`                  | command | Split changes into a logical sequence of commits.                                  |
| `/git:push`                      | command | Commit and push.                                                                   |
| `/git:pr`                        | command | Commit, push, and open a pull request.                                             |
| `/git:changelog`                 | command | Generate a changelog for a time period.                                            |
| `/git:branches`                  | command | Delete stale local branches whose remote tracking branch is gone.                  |
| `/git:worktrees`                 | command | Remove worktrees whose branch is gone on the remote, then delete them.             |
| `/git:amend-author`              | command | Rewrite the author of the whole branch or the last N commits.                      |
| `/git:amend-date`                | command | Set an absolute commit and author date on the most recent commit.                  |
| `/git:shift-dates`               | command | Shift the last N commit dates by a number of hours.                                |
| `/organize:*`                    | command | Section a config or code file under comment headers (eight header-style variants). |
| `/issues:improve-issue`          | command | Rewrite a GitHub issue to be clearer (outputs text).                               |
| `/issues:improve-issue-in-place` | command | Same rewrite, applied to the issue via `gh`.                                       |
| `/issues:github-coding-process`  | command | Plan, implement, test, and ship a GitHub issue end to end.                         |
| `/summarize:transscripts`        | command | Summarize a meeting or transcript into sections with action items.                 |
| `/simple:explain`                | command | Explain a code snippet step by step.                                               |
| `/simple:proofread`              | command | Proofread text for spelling, grammar, and readability.                             |
| `/simple:markitdown`             | command | Convert files (PDF, Office, images, audio, HTML) to Markdown.                      |
| `gh-cli`                         | skill   | Comprehensive `gh` reference for repos, PRs, Actions, releases.                    |
| `install-mcp`                    | skill   | Add a project-scoped MCP server to the repo.                                       |
| `meeting-summarizer`             | skill   | Turn a transcript into structured English notes.                                   |
| `organize`                       | skill   | Reorganize a config or code file into labeled sections.                            |

## By APM skill bundles (`apm.yml`)

Third-party skills pulled by `apm install`, which re-resolves to latest upstream on every run (no lockfile). Declared under `dependencies.apm` in [`apm.yml`](../../apm.yml), which is the source of truth for which skills are pulled. All are of kind `skill`.

### Matt Pocock bundle (`mattpocock/skills`)

The [`mattpocock/skills`](https://github.com/mattpocock/skills) bundle is deployed selectively: only the skills listed below are installed, by basename (they resolve across the bundle's category subdirs). To add or drop one, edit the `skills:` list under `mattpocock/skills` in [`apm.yml`](../../apm.yml) and keep this table in sync.

| Skill                           | Description                                                                                                    | Reference                                                                                                                                                                                    |
|---------------------------------|----------------------------------------------------------------------------------------------------------------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `grilling`                      | Stress-test a plan, decision, or idea.                                                                         | [aihero](https://www.aihero.dev/skills-grilling) · [SKILL.md](https://github.com/mattpocock/skills/blob/main/skills/productivity/grilling/SKILL.md)                                          |
| `grill-me`                      | Be interrogated on your own reasoning.                                                                         | [aihero](https://www.aihero.dev/skills-grill-me) · [SKILL.md](https://github.com/mattpocock/skills/blob/main/skills/productivity/grill-me/SKILL.md)                                          |
| `grill-with-docs`               | Interrogate an idea against real documentation.                                                                | [aihero](https://www.aihero.dev/skills-grill-with-docs) · [SKILL.md](https://github.com/mattpocock/skills/blob/main/skills/engineering/grill-with-docs/SKILL.md)                             |
| `codebase-design`               | Vocabulary for designing deep modules and placing seams.                                                       | [aihero](https://www.aihero.dev/skills-codebase-design) · [SKILL.md](https://github.com/mattpocock/skills/blob/main/skills/engineering/codebase-design/SKILL.md)                             |
| `domain-modeling`               | Build a ubiquitous language and record ADRs.                                                                   | [aihero](https://www.aihero.dev/skills-domain-modeling) · [SKILL.md](https://github.com/mattpocock/skills/blob/main/skills/engineering/domain-modeling/SKILL.md)                             |
| `wayfinder`                     | Orient quickly in an unfamiliar codebase.                                                                      | [aihero](https://www.aihero.dev/skills-wayfinder) · [SKILL.md](https://github.com/mattpocock/skills/blob/main/skills/engineering/wayfinder/SKILL.md)                                         |
| `handoff`                       | Capture session state so work can be picked up later.                                                          | [aihero](https://www.aihero.dev/skills-handoff) · [SKILL.md](https://github.com/mattpocock/skills/blob/main/skills/productivity/handoff/SKILL.md)                                            |
| `improve-codebase-architecture` | Assess and improve an existing codebase's architecture.                                                        | [aihero](https://www.aihero.dev/skills-improve-codebase-architecture) · [SKILL.md](https://github.com/mattpocock/skills/blob/main/skills/engineering/improve-codebase-architecture/SKILL.md) |
| `setup-matt-pocock-skills`      | Bootstrap the Matt Pocock skill set.                                                                           | [aihero](https://www.aihero.dev/skills-setup-matt-pocock-skills) · [SKILL.md](https://github.com/mattpocock/skills/blob/main/skills/engineering/setup-matt-pocock-skills/SKILL.md)           |
| `tdd`                           | Test-driven development, red-green-refactor.                                                                   | [aihero](https://www.aihero.dev/skills-tdd) · [SKILL.md](https://github.com/mattpocock/skills/blob/main/skills/engineering/tdd/SKILL.md)                                                     |
| `triage`                        | Triage and prioritize incoming work.                                                                           | [aihero](https://www.aihero.dev/skills-triage) · [SKILL.md](https://github.com/mattpocock/skills/blob/main/skills/engineering/triage/SKILL.md)                                               |
| `to-tickets`                    | Break a spec into discrete, buildable tickets.                                                                 | [aihero](https://www.aihero.dev/skills-to-tickets) · [SKILL.md](https://github.com/mattpocock/skills/blob/main/skills/engineering/to-tickets/SKILL.md)                                       |
| `to-spec`                       | Turn settled intent into a written behavioral spec.                                                            | [aihero](https://www.aihero.dev/skills-to-spec) · [SKILL.md](https://github.com/mattpocock/skills/blob/main/skills/engineering/to-spec/SKILL.md)                                             |
| `implement`                     | Build a single ticket to completion.                                                                           | [aihero](https://www.aihero.dev/skills-implement) · [SKILL.md](https://github.com/mattpocock/skills/blob/main/skills/engineering/implement/SKILL.md)                                         |
| `code-review`                   | Review a branch on repo standards and originating-spec adherence.                                              | [aihero](https://www.aihero.dev/skills-code-review) · [SKILL.md](https://github.com/mattpocock/skills/blob/main/skills/engineering/code-review/SKILL.md)                                     |
| `research`                      | Investigate a question against high-trust primary sources.                                                     | [aihero](https://www.aihero.dev/skills-research) · [SKILL.md](https://github.com/mattpocock/skills/blob/main/skills/engineering/research/SKILL.md)                                           |
| `prototype`                     | Build a throwaway prototype to sanity-check a direction.                                                       | [aihero](https://www.aihero.dev/skills-prototype) · [SKILL.md](https://github.com/mattpocock/skills/blob/main/skills/engineering/prototype/SKILL.md)                                         |
| `ask-matt`                      | Ask the Matt Pocock advisory skill.                                                                            | [aihero](https://www.aihero.dev/skills-ask-matt) · [SKILL.md](https://github.com/mattpocock/skills/blob/main/skills/engineering/ask-matt/SKILL.md)                                           |
| `diagnosing-bugs`               | Structured diagnosis loop for hard bugs and regressions.                                                       | [aihero](https://www.aihero.dev/skills-diagnosing-bugs) · [SKILL.md](https://github.com/mattpocock/skills/blob/main/skills/engineering/diagnosing-bugs/SKILL.md)                             |
| `resolving-merge-conflicts`     | Work through an in-progress merge or rebase conflict.                                                          | [aihero](https://www.aihero.dev/skills-resolving-merge-conflicts) · [SKILL.md](https://github.com/mattpocock/skills/blob/main/skills/engineering/resolving-merge-conflicts/SKILL.md)         |
| `teach`                         | Explain a concept or codebase area for onboarding.                                                             | [aihero](https://www.aihero.dev/skills-teach) · [SKILL.md](https://github.com/mattpocock/skills/blob/main/skills/productivity/teach/SKILL.md)                                                |
| `writing-great-skills`          | Author well-structured skills.                                                                                 | [aihero](https://www.aihero.dev/skills-writing-great-skills) · [SKILL.md](https://github.com/mattpocock/skills/blob/main/skills/productivity/writing-great-skills/SKILL.md)                  |
| `to-prd`                        | Turn a rough intent into a PRD. Resolves from the bundle on disk though not in the explicit `apm.yml` list.    | n/a                                                                                                                                                                                            |
| `to-issues`                     | Break the work into GitHub issues. Resolves from the bundle on disk though not in the explicit `apm.yml` list. | n/a                                                                                                                                                                                            |

**Main build chain.** The intended end-to-end flow for building a feature is `grill-with-docs` → `to-spec` → `to-tickets` → `implement` → `code-review`: interrogate the idea against docs, turn the settled intent into a written spec, break the spec into discrete tickets, build each ticket, then review the result. All five are in the table above.

### Other bundles

Flat bundles (the whole repo is one skill), so there is no per-skill selection like the Matt Pocock table above. Add a row here whenever a new non-Matt-Pocock bundle is added to `apm.yml`.

| Skill                                                                                                            | Bundle                                                                            | Description                                            |
|------------------------------------------------------------------------------------------------------------------|-----------------------------------------------------------------------------------|--------------------------------------------------------|
| [`terraform-skill`](https://github.com/antonbabenko/terraform-skill/blob/master/skills/terraform-skill/SKILL.md) | [`antonbabenko/terraform-skill`](https://github.com/antonbabenko/terraform-skill) | Write, review, and debug Terraform or OpenTofu.        |
| `neon`                                                                                                           | [`neondatabase/agent-skills`](https://github.com/neondatabase/agent-skills)       | Overview of the Neon platform.                         |
| `neon-postgres`                                                                                                  | [`neondatabase/agent-skills`](https://github.com/neondatabase/agent-skills)       | Setup and best practices for Neon serverless Postgres. |
| `neon-postgres-branches`                                                                                         | [`neondatabase/agent-skills`](https://github.com/neondatabase/agent-skills)       | Create the right Neon branch type for dev and test.    |

## By standalone CLI

Installed by a vendor CLI that ships with a companion binary. Source of truth: [`../../scripts/extensions/skills/install.sh`](../../scripts/extensions/skills/install.sh).

| Skill            | Kind  | Installed via                        | Description                                             |
|------------------|-------|--------------------------------------|---------------------------------------------------------|
| `playwright-cli` | skill | `playwright-cli install --skills`    | Automate browser interactions and run Playwright tests. |
| `orbit`          | skill | `glab skills install --global orbit` | GitLab AI coding agents skill.                          |

## By Claude plugins (`claude plugin install`)

Bundled inside plugins from various marketplaces. Source of truth for the set: [`../../scripts/extensions/plugins/install.sh`](../../scripts/extensions/plugins/install.sh). The reasoning on which plugins could move to APM is in [`../apm/plugin-migration.md`](../apm/plugin-migration.md).

| Plugin                    | Marketplace          | Provides                                                         | Kind     |
|---------------------------|----------------------|------------------------------------------------------------------|----------|
| `code-review`             | official             | `/code-review:code-review`                                       | command  |
| `feature-dev`             | official             | `/feature-dev:feature-dev`                                       | command  |
| `feature-dev`             | official             | `code-architect`, `code-explorer`, `code-reviewer`               | subagent |
| `code-simplifier`         | official             | `code-simplifier`                                                | subagent |
| `iterative-development`   | prime-radiant        | `iterative-development:*`                                        | skill    |
| `greenfield`              | prime-radiant        | `greenfield:analyze`, `greenfield:sanitize`                      | skill    |
| `context7`                | upstash              | `context7:docs`                                                  | skill    |
| `context7`                | upstash              | context7 server                                                  | MCP      |
| `code-refactoring`        | wshobson/agents      | `code-reviewer`, `legacy-modernizer`                             | subagent |
| `ast-grep`                | ast-grep/agent-skill | `ast-grep:ast-grep`                                              | skill    |
| `astral`                  | astral-sh            | `astral:ruff`, `astral:ty`, `astral:uv`                          | skill    |
| `codex`                   | openai               | `codex:rescue`, `codex:setup`                                    | skill    |
| `codex`                   | openai               | codex-rescue                                                     | subagent |
| `caveman`                 | caveman              | `caveman`, `caveman-review`, `caveman-help`, `compress`          | skill    |
| `ponytail`                | ponytail             | `ponytail`, `ponytail-review`, `ponytail-audit`, `ponytail-debt` | skill    |
| `pyright`                 | piebald-ai           | pyright                                                          | LSP      |
| `watch`                   | claude-video         | `watch:watch`                                                    | skill    |
| `glab`                    | gitlab               | GitLab CLI skills                                                | skill    |
| `cloudflare`              | cloudflare           | Cloudflare skills                                                | skill    |
| `chrome-devtools-mcp`     | chrome-devtools      | browser automation                                               | MCP      |
| `notion-workspace-plugin` | notion               | Notion workspace access                                          | skill    |

## Built into Claude Code

Shipped with the harness, no install step. All are of kind `skill`.

| Skill                      | Description                                                             |
|----------------------------|-------------------------------------------------------------------------|
| `init`                     | Initialize a `CLAUDE.md` documenting the codebase.                      |
| `run`                      | Launch and drive the app to see a change working.                       |
| `verify`                   | Exercise the affected flow end to end and observe behavior.             |
| `simplify`                 | Review changed code for reuse and simplification, then apply fixes.     |
| `review`                   | Review a GitHub pull request.                                           |
| `security-review`          | Security review of the pending changes on the current branch.           |
| `loop`                     | Run a prompt or slash command on a recurring interval.                  |
| `schedule`                 | Create and manage scheduled cloud agents on a cron schedule.            |
| `update-config`            | Configure the harness: permissions, env vars, hooks.                    |
| `keybindings-help`         | Customize keyboard shortcuts and chord bindings.                        |
| `claude-api`               | Reference for the Claude API and Anthropic SDK.                         |
| `fewer-permission-prompts` | Build an allowlist from transcripts to cut permission prompts.          |
| `dataviz`                  | Design guidance for charts, dashboards, and visualizations.             |
| `deep-research`            | Fan-out web research with adversarial verification into a cited report. |
| `artifact-design`          | Design guidance and fundamentals for Artifacts.                         |
| `artifact-capabilities`    | Runtime capabilities a published Artifact can declare.                  |
