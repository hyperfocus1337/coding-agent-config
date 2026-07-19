# Install source inventory

The companion to [`phases.md`](../sdlc/phases.md). Where `phases.md` answers "which tool for which phase", this page answers "where did each tool come from": installed manually, by an APM skill bundle, by a standalone CLI, by a Claude plugin, or built into Claude Code. The source of truth for each channel is the file named in that section's intro, not this page, since the sets drift over time.

Every tool is shown in a table. The `Kind` column distinguishes a slash `command`, a `skill`, a `subagent`, an `MCP` server, or an `LSP` server, since one plugin often ships several.

## Personal Claude configs

Plain files committed under `dot_claude/` and laid into `~/.claude` by `just chezmoi`. No install step beyond `just chezmoi`. Each item links to its source in this repo.

### Slash commands

Prompt templates under [`dot_claude/commands/`](../../dot_claude/commands/README.md).

| Command                                                                                        | Description                                                                        |
|------------------------------------------------------------------------------------------------|------------------------------------------------------------------------------------|
| [`/git:commit`](../../dot_claude/commands/git/commit.md)                                       | Create a git commit (stage all, single commit).                                    |
| [`/git:multiple`](../../dot_claude/commands/git/multiple.md)                                   | Split changes into a logical sequence of commits.                                  |
| [`/git:push`](../../dot_claude/commands/git/push.md)                                           | Commit and push.                                                                   |
| [`/git:pr`](../../dot_claude/commands/git/pr.md)                                               | Commit, push, and open a pull request.                                             |
| [`/git:changelog`](../../dot_claude/commands/git/changelog.md)                                 | Generate a changelog for a time period.                                            |
| [`/git:branches`](../../dot_claude/commands/git/branches.md)                                   | Delete stale local branches whose remote tracking branch is gone.                  |
| [`/git:worktrees`](../../dot_claude/commands/git/worktrees.md)                                 | Remove worktrees whose branch is gone on the remote, then delete them.             |
| [`/git:amend-author`](../../dot_claude/commands/git/amend-author.md)                           | Rewrite the author of the whole branch or the last N commits.                      |
| [`/git:amend-date`](../../dot_claude/commands/git/amend-date.md)                               | Set an absolute commit and author date on the most recent commit.                  |
| [`/git:shift-dates`](../../dot_claude/commands/git/shift-dates.md)                             | Shift the last N commit dates by a number of hours.                                |
| [`/organize:*`](../../dot_claude/commands/organize/)                                           | Section a config or code file under comment headers (eight header-style variants). |
| [`/issues:improve-issue`](../../dot_claude/commands/issues/improve-issue.md)                   | Rewrite a GitHub issue to be clearer (outputs text).                               |
| [`/issues:improve-issue-in-place`](../../dot_claude/commands/issues/improve-issue-in-place.md) | Same rewrite, applied to the issue via `gh`.                                       |
| [`/issues:github-coding-process`](../../dot_claude/commands/issues/github-coding-process.md)   | Plan, implement, test, and ship a GitHub issue end to end.                         |
| [`/summarize:transscripts`](../../dot_claude/commands/summarize/transscripts.md)               | Summarize a meeting or transcript into sections with action items.                 |
| [`/simple:explain`](../../dot_claude/commands/simple/explain.md)                               | Explain a code snippet step by step.                                               |
| [`/simple:proofread`](../../dot_claude/commands/simple/proofread.md)                           | Proofread text for spelling, grammar, and readability.                             |
| [`/simple:markitdown`](../../dot_claude/commands/simple/markitdown.md)                         | Convert files (PDF, Office, images, audio, HTML) to Markdown.                      |

### Skills

Local skills under [`dot_claude/skills/`](../../dot_claude/skills/).

| Skill                                                                       | Description                                                     |
|-----------------------------------------------------------------------------|-----------------------------------------------------------------|
| [`gh-cli`](../../dot_claude/skills/gh-cli/SKILL.md)                         | Comprehensive `gh` reference for repos, PRs, Actions, releases. |
| [`install-mcp`](../../dot_claude/skills/install-mcp/SKILL.md)               | Add a project-scoped MCP server to the repo.                    |
| [`meeting-summarizer`](../../dot_claude/skills/meeting-summarizer/SKILL.md) | Turn a transcript into structured English notes.                |
| [`organize`](../../dot_claude/skills/organize/SKILL.md)                     | Reorganize a config or code file into labeled sections.         |

## By APM skill bundles (`apm.yml`)

Third-party skills pulled by `apm install`, which re-resolves to latest upstream on every run (no lockfile). Declared under `dependencies.apm` in [`apm.yml`](../../apm.yml), which is the source of truth for which skills are pulled. All are of kind `skill`.

### Matt Pocock bundle (`mattpocock/skills`)

The [`mattpocock/skills`](https://github.com/mattpocock/skills) bundle is deployed selectively: only the skills listed below are installed, by basename (they resolve across the bundle's category subdirs). Each skill name links to its upstream `SKILL.md`; the `Reference` column links to its aihero documentation page. To add or drop one, edit the `skills:` list under `mattpocock/skills` in [`apm.yml`](../../apm.yml) and keep this table in sync.

| Skill                                                                                                                                       | Description                                                       | Reference                                                             |
|---------------------------------------------------------------------------------------------------------------------------------------------|-------------------------------------------------------------------|-----------------------------------------------------------------------|
| [`grilling`](https://github.com/mattpocock/skills/blob/main/skills/productivity/grilling/SKILL.md)                                          | Stress-test a plan, decision, or idea.                            | [aihero](https://www.aihero.dev/skills-grilling)                      |
| [`grill-me`](https://github.com/mattpocock/skills/blob/main/skills/productivity/grill-me/SKILL.md)                                          | Be interrogated on your own reasoning.                            | [aihero](https://www.aihero.dev/skills-grill-me)                      |
| [`grill-with-docs`](https://github.com/mattpocock/skills/blob/main/skills/engineering/grill-with-docs/SKILL.md)                             | Interrogate an idea against real documentation.                   | [aihero](https://www.aihero.dev/skills-grill-with-docs)               |
| [`codebase-design`](https://github.com/mattpocock/skills/blob/main/skills/engineering/codebase-design/SKILL.md)                             | Vocabulary for designing deep modules and placing seams.          | [aihero](https://www.aihero.dev/skills-codebase-design)               |
| [`domain-modeling`](https://github.com/mattpocock/skills/blob/main/skills/engineering/domain-modeling/SKILL.md)                             | Build a ubiquitous language and record ADRs.                      | [aihero](https://www.aihero.dev/skills-domain-modeling)               |
| [`wayfinder`](https://github.com/mattpocock/skills/blob/main/skills/engineering/wayfinder/SKILL.md)                                         | Orient quickly in an unfamiliar codebase.                         | [aihero](https://www.aihero.dev/skills-wayfinder)                     |
| [`handoff`](https://github.com/mattpocock/skills/blob/main/skills/productivity/handoff/SKILL.md)                                            | Capture session state so work can be picked up later.             | [aihero](https://www.aihero.dev/skills-handoff)                       |
| [`improve-codebase-architecture`](https://github.com/mattpocock/skills/blob/main/skills/engineering/improve-codebase-architecture/SKILL.md) | Assess and improve an existing codebase's architecture.           | [aihero](https://www.aihero.dev/skills-improve-codebase-architecture) |
| [`setup-matt-pocock-skills`](https://github.com/mattpocock/skills/blob/main/skills/engineering/setup-matt-pocock-skills/SKILL.md)           | Bootstrap the Matt Pocock skill set.                              | [aihero](https://www.aihero.dev/skills-setup-matt-pocock-skills)      |
| [`tdd`](https://github.com/mattpocock/skills/blob/main/skills/engineering/tdd/SKILL.md)                                                     | Test-driven development, red-green-refactor.                      | [aihero](https://www.aihero.dev/skills-tdd)                           |
| [`triage`](https://github.com/mattpocock/skills/blob/main/skills/engineering/triage/SKILL.md)                                               | Triage and prioritize incoming work.                              | [aihero](https://www.aihero.dev/skills-triage)                        |
| [`to-tickets`](https://github.com/mattpocock/skills/blob/main/skills/engineering/to-tickets/SKILL.md)                                       | Break a spec into discrete, buildable tickets.                    | [aihero](https://www.aihero.dev/skills-to-tickets)                    |
| [`to-spec`](https://github.com/mattpocock/skills/blob/main/skills/engineering/to-spec/SKILL.md)                                             | Turn settled intent into a written behavioral spec.               | [aihero](https://www.aihero.dev/skills-to-spec)                       |
| [`implement`](https://github.com/mattpocock/skills/blob/main/skills/engineering/implement/SKILL.md)                                         | Build a single ticket to completion.                              | [aihero](https://www.aihero.dev/skills-implement)                     |
| [`code-review`](https://github.com/mattpocock/skills/blob/main/skills/engineering/code-review/SKILL.md)                                     | Review a branch on repo standards and originating-spec adherence. | [aihero](https://www.aihero.dev/skills-code-review)                   |
| [`research`](https://github.com/mattpocock/skills/blob/main/skills/engineering/research/SKILL.md)                                           | Investigate a question against high-trust primary sources.        | [aihero](https://www.aihero.dev/skills-research)                      |
| [`prototype`](https://github.com/mattpocock/skills/blob/main/skills/engineering/prototype/SKILL.md)                                         | Build a throwaway prototype to sanity-check a direction.          | [aihero](https://www.aihero.dev/skills-prototype)                     |
| [`ask-matt`](https://github.com/mattpocock/skills/blob/main/skills/engineering/ask-matt/SKILL.md)                                           | Ask the Matt Pocock advisory skill.                               | [aihero](https://www.aihero.dev/skills-ask-matt)                      |
| [`diagnosing-bugs`](https://github.com/mattpocock/skills/blob/main/skills/engineering/diagnosing-bugs/SKILL.md)                             | Structured diagnosis loop for hard bugs and regressions.          | [aihero](https://www.aihero.dev/skills-diagnosing-bugs)               |
| [`resolving-merge-conflicts`](https://github.com/mattpocock/skills/blob/main/skills/engineering/resolving-merge-conflicts/SKILL.md)         | Work through an in-progress merge or rebase conflict.             | [aihero](https://www.aihero.dev/skills-resolving-merge-conflicts)     |
| [`teach`](https://github.com/mattpocock/skills/blob/main/skills/productivity/teach/SKILL.md)                                                | Explain a concept or codebase area for onboarding.                | [aihero](https://www.aihero.dev/skills-teach)                         |
| [`writing-great-skills`](https://github.com/mattpocock/skills/blob/main/skills/productivity/writing-great-skills/SKILL.md)                  | Author well-structured skills.                                    | [aihero](https://www.aihero.dev/skills-writing-great-skills)          |

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

| Skill                                                           | Kind  | Installed via                        | Description                                             |
|-----------------------------------------------------------------|-------|--------------------------------------|---------------------------------------------------------|
| [`playwright-cli`](https://github.com/microsoft/playwright-cli) | skill | `playwright-cli install --skills`    | Automate browser interactions and run Playwright tests. |
| [`orbit`](https://gitlab.com/gitlab-org/ai/skills)              | skill | `glab skills install --global orbit` | GitLab AI coding agents skill.                          |

## By Claude plugins (`claude plugin install`)

Bundled inside plugins from various marketplaces. Source of truth for the set: [`../../scripts/extensions/plugins/install.sh`](../../scripts/extensions/plugins/install.sh). The reasoning on which plugins could move to APM is in [`../apm/plugin-migration.md`](../apm/plugin-migration.md).

| Plugin                                                                                                       | Marketplace          | Provides                                                         | Kind     |
|--------------------------------------------------------------------------------------------------------------|----------------------|------------------------------------------------------------------|----------|
| [`code-review`](https://github.com/anthropics/claude-code/tree/main/plugins/code-review)                     | official             | `/code-review:code-review`                                       | command  |
| [`feature-dev`](https://github.com/anthropics/claude-code/tree/main/plugins/feature-dev)                     | official             | `/feature-dev:feature-dev`                                       | command  |
| [`feature-dev`](https://github.com/anthropics/claude-code/tree/main/plugins/feature-dev)                     | official             | `code-architect`, `code-explorer`, `code-reviewer`               | subagent |
| [`code-simplifier`](https://github.com/anthropics/claude-plugins-official/tree/main/plugins/code-simplifier) | official             | `code-simplifier`                                                | subagent |
| [`iterative-development`](https://github.com/prime-radiant-inc/iterative-development)                        | prime-radiant        | `iterative-development:*`                                        | skill    |
| [`greenfield`](https://github.com/prime-radiant-inc/greenfield)                                              | prime-radiant        | `greenfield:analyze`, `greenfield:sanitize`                      | skill    |
| [`context7`](https://github.com/upstash/context7)                                                            | upstash              | `context7:docs`                                                  | skill    |
| [`context7`](https://github.com/upstash/context7)                                                            | upstash              | context7 server                                                  | MCP      |
| [`code-refactoring`](https://github.com/wshobson/agents/tree/main/plugins/code-refactoring)                  | wshobson/agents      | `code-reviewer`, `legacy-modernizer`                             | subagent |
| [`ast-grep`](https://github.com/ast-grep/agent-skill)                                                        | ast-grep/agent-skill | `ast-grep:ast-grep`                                              | skill    |
| [`astral`](https://github.com/astral-sh/claude-code-plugins/tree/main/plugins/astral)                        | astral-sh            | `astral:ruff`, `astral:ty`, `astral:uv`                          | skill    |
| [`codex`](https://github.com/openai/codex-plugin-cc)                                                         | openai               | `codex:rescue`, `codex:setup`                                    | skill    |
| [`codex`](https://github.com/openai/codex-plugin-cc)                                                         | openai               | codex-rescue                                                     | subagent |
| [`caveman`](https://github.com/JuliusBrussee/caveman)                                                        | caveman              | `caveman`, `caveman-review`, `caveman-help`, `compress`          | skill    |
| [`ponytail`](https://github.com/DietrichGebert/ponytail)                                                     | ponytail             | `ponytail`, `ponytail-review`, `ponytail-audit`, `ponytail-debt` | skill    |
| [`pyright`](https://github.com/Piebald-AI/claude-code-lsps/tree/main/pyright)                                | piebald-ai           | pyright                                                          | LSP      |
| [`watch`](https://github.com/bradautomates/claude-video)                                                     | claude-video         | `watch:watch`                                                    | skill    |
| [`glab`](https://gitlab.com/gitlab-org/ai/skills)                                                            | gitlab               | GitLab CLI skills                                                | skill    |
| [`cloudflare`](https://github.com/cloudflare/skills)                                                         | cloudflare           | Cloudflare skills                                                | skill    |
| [`chrome-devtools-mcp`](https://github.com/ChromeDevTools/chrome-devtools-mcp)                               | chrome-devtools      | browser automation                                               | MCP      |
| [`notion-workspace-plugin`](https://github.com/makenotion/claude-code-notion-plugin)                         | notion               | Notion workspace access                                          | skill    |

## Built into Claude Code

Shipped with the harness, no install step. All are of kind `skill`. The Claude Code CLI is closed source, so there is no per-skill source repo. The prompt text for the skills below has been extracted verbatim from CLI v2.1.215 into a separate [`claude-code-skills`](https://github.com/hyperfocus1337/claude-code-skills) repository, so each skill name links to the actual SKILL.md text there. The official [Claude Code commands docs](https://code.claude.com/docs/en/commands) still describe what these built-in commands do, so their descriptions can be referenced there even though the source itself is closed.

| Skill                                                                                                         | Description                                                             |
|---------------------------------------------------------------------------------------------------------------|-------------------------------------------------------------------------|
| [`run`](https://github.com/hyperfocus1337/claude-code-skills/blob/main/skills/run.md)                         | Launch and drive the app to see a change working.                       |
| [`verify`](https://github.com/hyperfocus1337/claude-code-skills/blob/main/skills/verify.md)                   | Exercise the affected flow end to end and observe behavior.             |
| [`simplify`](https://github.com/hyperfocus1337/claude-code-skills/blob/main/skills/simplify.md)               | Review changed code for reuse and simplification, then apply fixes.     |
| [`review`](https://github.com/hyperfocus1337/claude-code-skills/blob/main/skills/review.md)                   | Review a GitHub pull request.                                           |
| [`security-review`](https://github.com/hyperfocus1337/claude-code-skills/blob/main/skills/security-review.md) | Security review of the pending changes on the current branch.           |
| [`loop`](https://github.com/hyperfocus1337/claude-code-skills/blob/main/skills/loop.md)                       | Run a prompt or slash command on a recurring interval.                  |
| [`dataviz`](https://github.com/hyperfocus1337/claude-code-skills/blob/main/skills/dataviz.md)                 | Design guidance for charts, dashboards, and visualizations.             |
| [`deep-research`](https://github.com/hyperfocus1337/claude-code-skills/blob/main/skills/deep-research.md)     | Fan-out web research with adversarial verification into a cited report. |
