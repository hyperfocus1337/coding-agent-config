# Install source inventory

The companion to [`phases.md`](../sdlc/phases.md). Where `phases.md` answers "which tool for which phase", this page answers "where did each tool come from": installed manually, by an APM skill bundle, by a standalone CLI, by a Claude plugin, or built into Claude Code. The source of truth for each channel is the file named in that section's intro, not this page, since the sets drift over time.

Every tool is shown in a table. The `Kind` column distinguishes a slash `command`, a `skill`, a `subagent`, an `MCP` server, or an `LSP` server, since one plugin often ships several.

## Personal Claude configs

Plain files committed under `dot_claude/` and laid into `~/.claude` by `just chezmoi`. No install step beyond `just chezmoi`. Each item links to its source in this repo.

### Slash commands

Prompt templates under [`dot_claude/commands/`](../../dot_claude/commands/README.md). Grouped by task, subheaders and rows sorted alphabetically.

#### Files and configs

| Command                                              | Description                                                                        |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------- |
| [`/organize:*`](../../dot_claude/commands/organize/) | Section a config or code file under comment headers (eight header-style variants). |

#### Git

| Command                                                                            | Description                                                                      |
| ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| [`/git:branches`](../../dot_claude/commands/git/branches.md)                       | Delete stale local branches whose remote tracking branch is gone.                |
| [`/git:changelog`](../../dot_claude/commands/git/changelog.md)                     | Generate a changelog for a time period.                                          |
| [`/git:commit:multiple`](../../dot_claude/commands/git/commit/multiple.md)         | Split changes into a logical sequence of commits.                                |
| [`/git:commit:session`](../../dot_claude/commands/git/commit/session.md)           | Commit one task's changes from the current conversation.                         |
| [`/git:commit:single`](../../dot_claude/commands/git/commit/single.md)             | Create a git commit (stage all, single commit).                                  |
| [`/git:pr`](../../dot_claude/commands/git/pr.md)                                   | Commit, push, and open a pull request.                                           |
| [`/git:push`](../../dot_claude/commands/git/push.md)                               | Commit and push.                                                                 |
| [`/git:rewrite:author`](../../dot_claude/commands/git/rewrite/author.md)           | Rewrite the author of the whole branch or the last N commits.                    |
| [`/git:rewrite:date`](../../dot_claude/commands/git/rewrite/date.md)               | Set an absolute commit and author date on the most recent commit.                |
| [`/git:rewrite:shift-dates`](../../dot_claude/commands/git/rewrite/shift-dates.md) | Shift the last N commit dates by a number of hours.                              |
| [`/git:worktrees:cleanup`](../../dot_claude/commands/git/worktrees/cleanup.md)     | Remove worktrees whose branch is gone on the remote, then delete them.           |
| [`/git:worktrees:configure`](../../dot_claude/commands/git/worktrees/configure.md) | Set `worktree.useRelativePaths` so worktrees work from a container and the host. |

#### GitHub issues

| Command                                                                                        | Description                                                |
| ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| [`/issues:github-coding-process`](../../dot_claude/commands/issues/github-coding-process.md)   | Plan, implement, test, and ship a GitHub issue end to end. |
| [`/issues:improve-issue`](../../dot_claude/commands/issues/improve-issue.md)                   | Rewrite a GitHub issue to be clearer (outputs text).       |
| [`/issues:improve-issue-in-place`](../../dot_claude/commands/issues/improve-issue-in-place.md) | Same rewrite, applied to the issue via `gh`.               |

#### Text

| Command                                                                          | Description                                                        |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| [`/simple:explain`](../../dot_claude/commands/simple/explain.md)                 | Explain a code snippet step by step.                               |
| [`/simple:markitdown`](../../dot_claude/commands/simple/markitdown.md)           | Convert files (PDF, Office, images, audio, HTML) to Markdown.      |
| [`/simple:proofread`](../../dot_claude/commands/simple/proofread.md)             | Proofread text for spelling, grammar, and readability.             |
| [`/summarize:transscripts`](../../dot_claude/commands/summarize/transscripts.md) | Summarize a meeting or transcript into sections with action items. |

### Skills

Local skills under [`dot_claude/skills/`](../../dot_claude/skills/). Grouped by task, subheaders and rows sorted alphabetically.

#### Git and GitHub

| Skill                                               | Description                                                     |
| --------------------------------------------------- | --------------------------------------------------------------- |
| [`gh-cli`](../../dot_claude/skills/gh-cli/SKILL.md) | Comprehensive `gh` reference for repos, PRs, Actions, releases. |

#### Install

| Skill                                                                                 | Description                                                  |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| [`install-agent-resources`](../../dot_claude/skills/install-agent-resources/SKILL.md) | Route an install request to the skill that owns the channel. |
| [`install-bootstrap`](../../dot_claude/skills/install-bootstrap/SKILL.md)             | Install the cloud bootstrap hook into a repository.          |
| [`install-mcp`](../../dot_claude/skills/install-mcp/SKILL.md)                         | Install an MCP server at project, local, or user scope.      |
| [`install-plugins`](../../dot_claude/skills/install-plugins/SKILL.md)                 | Install a Claude plugin at project, local, or user scope.    |
| [`install-skills`](../../dot_claude/skills/install-skills/SKILL.md)                   | Install a skill at project, local, or user scope.            |

#### Text and files

| Skill                                                                       | Description                                             |
| --------------------------------------------------------------------------- | ------------------------------------------------------- |
| [`meeting-summarizer`](../../dot_claude/skills/meeting-summarizer/SKILL.md) | Turn a transcript into structured English notes.        |
| [`organize`](../../dot_claude/skills/organize/SKILL.md)                     | Reorganize a config or code file into labeled sections. |

## By APM skill bundles (`apm.yml`)

Third-party skills pulled by `apm install`, which re-resolves to latest upstream on every run (no lockfile). Declared under `dependencies.apm` in [`apm.yml`](../../apm.yml), which is the source of truth for which skills are pulled. All are of kind `skill`.

A bundle is either flat (the whole repo is one skill) or a repo whose `skills/` dir holds many, in which case `apm.yml` names the subset to pull. Add a row here whenever a new bundle is added to `apm.yml`.

| Skill                                                                                                            | Bundle                                                                            | Description                                     |
| ---------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | ----------------------------------------------- |
| [`terraform-skill`](https://github.com/antonbabenko/terraform-skill/blob/master/skills/terraform-skill/SKILL.md) | [`antonbabenko/terraform-skill`](https://github.com/antonbabenko/terraform-skill) | Write, review, and debug Terraform or OpenTofu. |

## By APM skill bundles, per repo

Bundles that cost resident tokens in every session but earn them in one kind of repo only. They are not in the user-scope [`apm.yml`](../../apm.yml); their rows in [`skills.json`](../../dot_claude/skills/install-skills/references/skills.json) carry `scope: project` or `scope: local`, and `install-skills` writes the `skills:` subset into the target repo's own `apm.yml`. All are of kind `skill`.

| Skill                    | Bundle                                                                      | Description                                            |
| ------------------------ | --------------------------------------------------------------------------- | ------------------------------------------------------ |
| `neon`                   | [`neondatabase/agent-skills`](https://github.com/neondatabase/agent-skills) | Overview of the Neon platform.                         |
| `neon-postgres`          | [`neondatabase/agent-skills`](https://github.com/neondatabase/agent-skills) | Setup and best practices for Neon serverless Postgres. |
| `neon-postgres-branches` | [`neondatabase/agent-skills`](https://github.com/neondatabase/agent-skills) | Create the right Neon branch type for dev and test.    |
| 7 cmux skills            | [`manaflow-ai/cmux`](https://github.com/manaflow-ai/cmux/tree/main/skills)  | Drive the cmux terminal from an agent (table below).   |

### cmux skills (`manaflow-ai/cmux`)

The cmux terminal ships its skills in the repo's [`skills/`](https://github.com/manaflow-ai/cmux/tree/main/skills) dir, documented at [cmux.com/docs/skills](https://cmux.com/docs/skills). Upstream installs them with `npx skills add manaflow-ai/cmux`; here APM pulls the same directories into a project. Only the seven user-facing skills below are taken; the rest of that dir (`cmux-backend`, `-billing`, `-release`, `-testing`, `-architecture`, and others) targets contributors to cmux itself. Each name links to its upstream `SKILL.md`.

| Skill                                                                                                    | Description                                                                    |
| -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| [`cmux`](https://github.com/manaflow-ai/cmux/blob/main/skills/cmux/SKILL.md)                             | Control cmux topology and routing: windows, workspaces, panes, focus, moves.   |
| [`cmux-workspace`](https://github.com/manaflow-ai/cmux/blob/main/skills/cmux-workspace/SKILL.md)         | Scope work to the workspace and surface that invoked the agent.                |
| [`cmux-settings`](https://github.com/manaflow-ai/cmux/blob/main/skills/cmux-settings/SKILL.md)           | View and edit `~/.config/cmux/cmux.json`, including shortcuts.                 |
| [`cmux-customization`](https://github.com/manaflow-ai/cmux/blob/main/skills/cmux-customization/SKILL.md) | Customize actions, layouts, palette entries, and browser routing.              |
| [`cmux-diagnostics`](https://github.com/manaflow-ai/cmux/blob/main/skills/cmux-diagnostics/SKILL.md)     | Run support-safe health checks on hooks, notifications, sockets, and restore.  |
| [`cmux-browser`](https://github.com/manaflow-ai/cmux/blob/main/skills/cmux-browser/SKILL.md)             | Automate browser surfaces: open sites, interact, wait for state, extract data. |
| [`cmux-markdown`](https://github.com/manaflow-ai/cmux/blob/main/skills/cmux-markdown/SKILL.md)           | Open a markdown file in a live-reloading viewer panel next to the terminal.    |

## By standalone CLI

Installed by a vendor CLI that ships with a companion binary. Source of truth for the set: [`../../dot_claude/skills/install-skills/references/skills.json`](../../dot_claude/skills/install-skills/references/skills.json), which [`../../scripts/extensions/skills/install.sh`](../../scripts/extensions/skills/install.sh) executes.

| Skill                                                           | Kind  | Installed via                        | Description                                             |
| --------------------------------------------------------------- | ----- | ------------------------------------ | ------------------------------------------------------- |
| [`playwright-cli`](https://github.com/microsoft/playwright-cli) | skill | `playwright-cli install --skills`    | Automate browser interactions and run Playwright tests. |
| [`orbit`](https://gitlab.com/gitlab-org/ai/skills)              | skill | `glab skills install --global orbit` | GitLab AI coding agents skill.                          |

## By Claude plugins (`claude plugin install`)

Bundled inside plugins from various marketplaces. Source of truth for the set: [`../../dot_claude/skills/install-plugins/references/plugins.json`](../../dot_claude/skills/install-plugins/references/plugins.json), which [`../../scripts/extensions/plugins/install.sh`](../../scripts/extensions/plugins/install.sh) executes. The reasoning on which plugins could move to APM is in [`../research/plugin-migration.md`](../research/plugin-migration.md).

| Plugin                                                                                               | Marketplace          | Provides                                                         | Kind     |
| ---------------------------------------------------------------------------------------------------- | -------------------- | ---------------------------------------------------------------- | -------- |
| [`feature-dev`](https://github.com/anthropics/claude-code/tree/main/plugins/feature-dev)             | official             | `/feature-dev:feature-dev`                                       | command  |
| [`feature-dev`](https://github.com/anthropics/claude-code/tree/main/plugins/feature-dev)             | official             | `code-architect`, `code-explorer`, `code-reviewer`               | subagent |
| [`iterative-development`](https://github.com/prime-radiant-inc/iterative-development)                | prime-radiant        | `iterative-development:*`                                        | skill    |
| [`code-refactoring`](https://github.com/wshobson/agents/tree/main/plugins/code-refactoring)          | wshobson/agents      | `code-reviewer`, `legacy-modernizer`                             | subagent |
| [`mattpocock-skills`](https://github.com/mattpocock/skills)                                          | mattpocock           | 25 engineering and productivity skills (table below)             | skill    |
| [`ast-grep`](https://github.com/ast-grep/agent-skill)                                                | ast-grep/agent-skill | `ast-grep:ast-grep`                                              | skill    |
| [`astral`](https://github.com/astral-sh/claude-code-plugins/tree/main/plugins/astral)                | astral-sh            | `astral:ruff`, `astral:ty`, `astral:uv`                          | skill    |
| [`codex`](https://github.com/openai/codex-plugin-cc)                                                 | openai               | `codex:rescue`, `codex:setup`                                    | skill    |
| [`codex`](https://github.com/openai/codex-plugin-cc)                                                 | openai               | codex-rescue                                                     | subagent |
| [`caveman`](https://github.com/JuliusBrussee/caveman)                                                | caveman              | `caveman`, `caveman-review`, `caveman-help`, `compress`          | skill    |
| [`ponytail`](https://github.com/DietrichGebert/ponytail)                                             | ponytail             | `ponytail`, `ponytail-review`, `ponytail-audit`, `ponytail-debt` | skill    |
| [`pyright-lsp`](https://github.com/anthropics/claude-plugins-official/tree/main/plugins/pyright-lsp) | official             | pyright                                                          | LSP      |
| [`watch`](https://github.com/bradautomates/claude-video)                                             | claude-video         | `watch:watch`                                                    | skill    |
| [`glab`](https://gitlab.com/gitlab-org/ai/skills)                                                    | gitlab               | GitLab CLI skills                                                | skill    |
| [`cloudflare`](https://github.com/cloudflare/skills)                                                 | cloudflare           | Cloudflare skills                                                | skill    |
| [`chrome-devtools-mcp`](https://github.com/ChromeDevTools/chrome-devtools-mcp)                       | chrome-devtools      | browser automation                                               | MCP      |
| [`notion-workspace-plugin`](https://github.com/makenotion/claude-code-notion-plugin)                 | notion               | Notion workspace access                                          | skill    |

### Matt Pocock skills (`mattpocock-skills`)

Installed whole from the [`mattpocock`](https://github.com/mattpocock/skills) marketplace: `claude plugin install mattpocock-skills@mattpocock`. There is no per-skill selection, so the plugin's own [`plugin.json`](https://github.com/mattpocock/skills/blob/main/.claude-plugin/plugin.json) is the source of truth. The tables below are a quick reference and will go stale as upstream adds, renames, or drops skills. Each skill name links to its upstream `SKILL.md`; the `Reference` column links to its aihero documentation page. The two subheaders match the upstream `skills/engineering/` and `skills/productivity/` directories. Rows sorted alphabetically.

#### Engineering

| Skill                                                                                                                                       | Description                                                       | Reference                                                                                                 |
| ------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| [`ask-matt`](https://github.com/mattpocock/skills/blob/main/skills/engineering/ask-matt/SKILL.md)                                           | Ask the Matt Pocock advisory skill.                               | [aihero](https://www.aihero.dev/skills-ask-matt)                                                          |
| [`code-review`](https://github.com/mattpocock/skills/blob/main/skills/engineering/code-review/SKILL.md)                                     | Review a branch on repo standards and originating-spec adherence. | [aihero](https://www.aihero.dev/skills-code-review)                                                       |
| [`codebase-design`](https://github.com/mattpocock/skills/blob/main/skills/engineering/codebase-design/SKILL.md)                             | Vocabulary for designing deep modules and placing seams.          | [aihero](https://www.aihero.dev/skills-codebase-design)                                                   |
| [`diagnosing-bugs`](https://github.com/mattpocock/skills/blob/main/skills/engineering/diagnosing-bugs/SKILL.md)                             | Structured diagnosis loop for hard bugs and regressions.          | [aihero](https://www.aihero.dev/skills-diagnosing-bugs)                                                   |
| [`domain-modeling`](https://github.com/mattpocock/skills/blob/main/skills/engineering/domain-modeling/SKILL.md)                             | Build a ubiquitous language and record ADRs.                      | [aihero](https://www.aihero.dev/skills-domain-modeling)                                                   |
| [`grill-with-docs`](https://github.com/mattpocock/skills/blob/main/skills/engineering/grill-with-docs/SKILL.md)                             | Interrogate an idea against real documentation.                   | [aihero](https://www.aihero.dev/skills-grill-with-docs)                                                   |
| [`implement`](https://github.com/mattpocock/skills/blob/main/skills/engineering/implement/SKILL.md)                                         | Build a single ticket to completion.                              | [aihero](https://www.aihero.dev/skills-implement)                                                         |
| [`improve-codebase-architecture`](https://github.com/mattpocock/skills/blob/main/skills/engineering/improve-codebase-architecture/SKILL.md) | Assess and improve an existing codebase's architecture.           | [aihero](https://www.aihero.dev/skills-improve-codebase-architecture)                                     |
| [`prototype`](https://github.com/mattpocock/skills/blob/main/skills/engineering/prototype/SKILL.md)                                         | Build a throwaway prototype to sanity-check a direction.          | [aihero](https://www.aihero.dev/skills-prototype)                                                         |
| [`research`](https://github.com/mattpocock/skills/blob/main/skills/engineering/research/SKILL.md)                                           | Investigate a question against high-trust primary sources.        | [aihero](https://www.aihero.dev/skills-research)                                                          |
| [`resolving-merge-conflicts`](https://github.com/mattpocock/skills/blob/main/skills/engineering/resolving-merge-conflicts/SKILL.md)         | Work through an in-progress merge or rebase conflict.             | [aihero](https://www.aihero.dev/skills-resolving-merge-conflicts)                                         |
| [`setup-matt-pocock-skills`](https://github.com/mattpocock/skills/blob/main/skills/engineering/setup-matt-pocock-skills/SKILL.md)           | Bootstrap the Matt Pocock skill set.                              | [aihero](https://www.aihero.dev/skills-setup-matt-pocock-skills)                                          |
| [`tdd`](https://github.com/mattpocock/skills/blob/main/skills/engineering/tdd/SKILL.md)                                                     | Test-driven development, red-green-refactor.                      | [aihero](https://www.aihero.dev/skills-tdd)                                                               |
| [`to-spec`](https://github.com/mattpocock/skills/blob/main/skills/engineering/to-spec/SKILL.md)                                             | Turn settled intent into a written behavioral spec.               | [aihero](https://www.aihero.dev/skills-to-spec)                                                           |
| [`to-tickets`](https://github.com/mattpocock/skills/blob/main/skills/engineering/to-tickets/SKILL.md)                                       | Break a spec into discrete, buildable tickets.                    | [aihero](https://www.aihero.dev/skills-to-tickets)                                                        |
| [`triage`](https://github.com/mattpocock/skills/blob/main/skills/engineering/triage/SKILL.md)                                               | Triage and prioritize incoming work.                              | [aihero](https://www.aihero.dev/skills-triage)                                                            |
| [`wayfinder`](https://github.com/mattpocock/skills/blob/main/skills/engineering/wayfinder/SKILL.md)                                         | Orient quickly in an unfamiliar codebase.                         | [aihero](https://www.aihero.dev/skills-wayfinder), [youtube](https://www.youtube.com/watch?v=F3lL98Pj90o) |
| [`wizard`](https://github.com/mattpocock/skills/blob/main/skills/engineering/wizard/SKILL.md)                                               | Generate a bash wizard for steps only a human can perform.        | [aihero](https://www.aihero.dev/skills-wizard)                                                            |

#### Productivity

| Skill                                                                                                                  | Description                                            | Reference                                                                                                   |
| ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| [`grill-me`](https://github.com/mattpocock/skills/blob/main/skills/productivity/grill-me/SKILL.md)                     | Be interrogated on your own reasoning.                 | [aihero](https://www.aihero.dev/skills-grill-me)                                                            |
| [`grilling`](https://github.com/mattpocock/skills/blob/main/skills/productivity/grilling/SKILL.md)                     | Stress-test a plan, decision, or idea.                 | [aihero](https://www.aihero.dev/skills-grilling)                                                            |
| [`handoff`](https://github.com/mattpocock/skills/blob/main/skills/productivity/handoff/SKILL.md)                       | Capture session state so work can be picked up later.  | [aihero](https://www.aihero.dev/skills-handoff)                                                             |
| [`teach`](https://github.com/mattpocock/skills/blob/main/skills/productivity/teach/SKILL.md)                           | Explain a concept or codebase area for onboarding.     | [aihero](https://www.aihero.dev/skills-teach)                                                               |
| [`to-questionnaire`](https://github.com/mattpocock/skills/blob/main/skills/productivity/to-questionnaire/SKILL.md)     | Turn a decision you can't answer into a questionnaire. | [aihero](https://www.aihero.dev/skills-to-questionnaire)                                                    |
| [`wait-what`](https://github.com/mattpocock/skills/blob/main/skills/productivity/wait-what/SKILL.md)                   | Make the agent re-pitch a message that did not land.   | [aihero](https://www.aihero.dev/skills-wait-what), [youtube](https://youtube.com/watch?v=gaDdrDdczO4&t=152) |
| [`writing-for-agents`](https://github.com/mattpocock/skills/blob/main/skills/productivity/writing-for-agents/SKILL.md) | Write skills, `AGENTS.md`, and `CLAUDE.md` for agents. | [aihero](https://www.aihero.dev/skills-writing-for-agents)                                                  |

**Main build chain.** The intended end-to-end flow for building a feature is `grill-with-docs` OR `wayfinder` → `to-spec` → `to-tickets` → `implement` → `code-review`: interrogate the idea against docs, turn the settled intent into a written spec, break the spec into discrete tickets, build each ticket, then review the result. All five are in the Engineering table above.

## Built into Claude Code

Shipped with the harness, no install step. All are of kind `skill`. The Claude Code CLI is closed source, so there is no per-skill source repo. The prompt text for the skills below has been extracted verbatim from CLI v2.1.215 into a separate [`claude-code-skills`](https://github.com/hyperfocus1337/claude-code-skills) repository, so each skill name links to the actual SKILL.md text there. The official [Claude Code commands docs](https://code.claude.com/docs/en/commands) still describe what these built-in commands do, so their descriptions can be referenced there even though the source itself is closed.

Grouped by task, subheaders and rows sorted alphabetically.

### Automation

| Skill                                                                                   | Description                                            |
| --------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| [`loop`](https://github.com/hyperfocus1337/claude-code-skills/blob/main/skills/loop.md) | Run a prompt or slash command on a recurring interval. |

### Research and output

| Skill                                                                                                     | Description                                                             |
| --------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| [`dataviz`](https://github.com/hyperfocus1337/claude-code-skills/blob/main/skills/dataviz.md)             | Design guidance for charts, dashboards, and visualizations.             |
| [`deep-research`](https://github.com/hyperfocus1337/claude-code-skills/blob/main/skills/deep-research.md) | Fan-out web research with adversarial verification into a cited report. |

### Review

| Skill                                                                                                         | Description                                                         |
| ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| [`review`](https://github.com/hyperfocus1337/claude-code-skills/blob/main/skills/review.md)                   | Review a GitHub pull request.                                       |
| [`security-review`](https://github.com/hyperfocus1337/claude-code-skills/blob/main/skills/security-review.md) | Security review of the pending changes on the current branch.       |
| [`simplify`](https://github.com/hyperfocus1337/claude-code-skills/blob/main/skills/simplify.md)               | Review changed code for reuse and simplification, then apply fixes. |

### Run and verify

| Skill                                                                                       | Description                                                 |
| ------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| [`run`](https://github.com/hyperfocus1337/claude-code-skills/blob/main/skills/run.md)       | Launch and drive the app to see a change working.           |
| [`verify`](https://github.com/hyperfocus1337/claude-code-skills/blob/main/skills/verify.md) | Exercise the affected flow end to end and observe behavior. |
