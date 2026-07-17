# Software development lifecycle command map

This page maps the slash commands, skills, and subagents installed in this environment onto the phases of the software development lifecycle (SDLC). The goal is a practical answer to one question: at any point in building software, which installed tools can I reach for. Entries are grouped by SDLC phase, and within each phase by the role that typically drives that work. A tool that genuinely serves more than one phase is listed under each phase it fits, so every phase table stands on its own.

The `Type` column says what the entry is, not where it came from: `command` for a slash-command prompt template, `skill` for a Skill-tool workflow, and `agent` for a subagent type dispatched via the Agent tool. Install source (manually committed, pulled by APM, a standalone CLI, a Claude plugin, or built into Claude Code) is deliberately kept out of the phase tables to keep them readable. The full source classification lives in the [inventory by install source](#inventory-by-install-source) appendix at the end.

## The phases and roles

The lifecycle used here has eight phases. Roles map onto phases rather than owning them: the same engineer plans, builds, and reviews, but the tooling that helps differs by activity, so the role sub-headings group tools by the hat you are wearing at that moment.

| Phase                       | Primary roles           | What happens                                                                   |
|-----------------------------|-------------------------|--------------------------------------------------------------------------------|
| 1. Plan and requirements    | Product or BA, Engineer | Gather requirements, shape issues, stress-test the idea, scope the work        |
| 2. Design and architecture  | Architect, Engineer     | Domain modeling, module design, prototypes, orientation in the codebase        |
| 3. Implementation           | Engineer, Data, Infra   | Write code, build features test-first, wire databases and infrastructure       |
| 4. Code review              | Reviewer                | Standards and spec review, security review, over-engineering audits            |
| 5. Testing and QA           | QA, Engineer            | Verify behavior end to end, browser automation, evidence corpus, bug diagnosis |
| 6. Build, release and CI/CD | Engineer, Release       | Commit hygiene, changelogs, merges, pull requests, release plumbing            |
| 7. Deploy and operate       | DevOps, SRE             | Scheduled agents, recurring jobs, infrastructure and database operations       |
| 8. Maintain and document    | Engineer, Tech writer   | Modernize legacy code, refactor, write and summarize documentation             |

A set of cross-cutting tools that apply to every phase (output compression, simplicity enforcement, harness configuration, documentation lookup) is listed once in its own [cross-cutting section](#cross-cutting-every-phase) rather than repeated under all eight.

## Phase 1: plan and requirements

### Product or BA

| Command                          | Type    | Description                                                              |
|----------------------------------|---------|--------------------------------------------------------------------------|
| `/issues:improve-issue`          | command | Rewrite a GitHub issue to be clearer and more actionable (outputs text). |
| `/issues:improve-issue-in-place` | command | Same rewrite, applied directly to the issue via `gh`.                    |
| `to-prd`                         | skill   | Turn a rough intent into a product requirements document.                |
| `to-spec`                        | skill   | Turn settled intent into a written behavioral spec.                      |
| `to-tickets`                     | skill   | Break a spec into discrete, buildable tickets.                           |
| `to-issues`                      | skill   | Break the work into GitHub issues.                                       |
| `triage`                         | skill   | Triage and prioritize incoming work.                                     |

### Engineer

| Command           | Type  | Description                                                                     |
|-------------------|-------|---------------------------------------------------------------------------------|
| `grilling`        | skill | Relentlessly stress-test a plan, decision, or idea before committing to it.     |
| `grill-me`        | skill | Be interrogated on your own reasoning to surface gaps.                          |
| `grill-with-docs` | skill | Interrogate an idea against real documentation.                                 |
| `research`        | skill | Investigate a question against high-trust primary sources and capture findings. |
| `deep-research`   | skill | Fan-out web research with adversarial verification into a cited report.         |
| `wayfinder`       | skill | Orient quickly in an unfamiliar codebase.                                       |
| `init`            | skill | Initialize a `CLAUDE.md` documenting the codebase for future sessions.          |

## Phase 2: design and architecture

### Architect

| Command                         | Type  | Description                                                                        |
|---------------------------------|-------|------------------------------------------------------------------------------------|
| `codebase-design`               | skill | Shared vocabulary for designing deep modules and placing seams.                    |
| `domain-modeling`               | skill | Build a ubiquitous language and record architectural decisions (ADRs).             |
| `improve-codebase-architecture` | skill | Assess and improve the architecture of an existing codebase.                       |
| `code-architect`                | agent | Produce an implementation blueprint from existing codebase patterns (feature-dev). |
| `prototype`                     | skill | Build a throwaway prototype to sanity-check a state model or UI direction.         |
| `grilling`                      | skill | Stress-test the chosen design against its weakest assumptions.                     |
| `research`                      | skill | Gather primary-source facts to back a design decision.                             |
| `context7:docs`                 | skill | Pull current library and framework docs to inform design choices.                  |

### Engineer

| Command         | Type  | Description                                                                          |
|-----------------|-------|--------------------------------------------------------------------------------------|
| `code-explorer` | agent | Trace execution paths and map the architecture of an existing feature (feature-dev). |
| `wayfinder`     | skill | Map the terrain before proposing where a change fits.                                |
| `install-mcp`   | skill | Wire a project-scoped MCP server into the repo when the design needs one.            |

## Phase 3: implementation

### Engineer

| Command                    | Type    | Description                                                                          |
|----------------------------|---------|--------------------------------------------------------------------------------------|
| `/feature-dev:feature-dev` | command | Guided feature development with codebase understanding and architecture focus.       |
| `implement`                | skill   | Build a single ticket to completion.                                                 |
| `tdd`                      | skill   | Test-driven development with a red-green-refactor loop.                              |
| `prototype`                | skill   | Explore an approach with throwaway code before committing to it.                     |
| `run`                      | skill   | Launch and drive the app to see a change working in the real thing.                  |
| `context7:docs`            | skill   | Look up exact API syntax and config while writing code.                              |
| `ast-grep:ast-grep`        | skill   | Structural code search and rewrite across the codebase by AST pattern.               |
| `astral:ruff`              | skill   | Fast Python linting and formatting.                                                  |
| `astral:ty`                | skill   | Fast Python type checking.                                                           |
| `astral:uv`                | skill   | Python package, project, and script management.                                      |
| `/organize:*`              | command | Section a config or code file under comment-delimited headers (eight header styles). |
| `/simple:explain`          | command | Explain a code snippet step by step.                                                 |
| `codex:rescue`             | agent   | Hand a stuck or heavy task to the Codex rescue subagent for a second pass.           |

### Data

| Command                  | Type  | Description                                                                   |
|--------------------------|-------|-------------------------------------------------------------------------------|
| `neon`                   | skill | Overview of the Neon platform (Postgres, Auth, Data API, storage, functions). |
| `neon-postgres`          | skill | Setup and best practices for Neon serverless Postgres.                        |
| `neon-postgres-branches` | skill | Create the right Neon branch type for dev and test workflows.                 |

### Infra

| Command           | Type  | Description                                             |
|-------------------|-------|---------------------------------------------------------|
| `terraform-skill` | skill | Write, review, and debug Terraform or OpenTofu modules. |
| `cloudflare`      | skill | Cloudflare platform skills for building on the edge.    |

## Phase 4: code review

### Reviewer

| Command                    | Type    | Description                                                                                       |
|----------------------------|---------|---------------------------------------------------------------------------------------------------|
| `/code-review:code-review` | command | Code review a pull request (official plugin).                                                     |
| `code-review`              | skill   | Review a branch on two axes: repo standards and originating-spec adherence.                       |
| `/review`                  | skill   | Review a GitHub pull request.                                                                     |
| `security-review`          | skill   | Security review of the pending changes on the current branch.                                     |
| `simplify`                 | skill   | Review changed code for reuse and simplification, then apply the fixes.                           |
| `ponytail-review`          | skill   | Review a diff purely for over-engineering: what to delete or replace with stdlib.                 |
| `ponytail-audit`           | skill   | Whole-repo over-engineering audit with a ranked list of what to cut.                              |
| `caveman-review`           | skill   | Compressed one-line-per-finding PR review comments.                                               |
| `code-reviewer`            | agent   | Review for bugs, security, performance, and convention adherence (feature-dev, code-refactoring). |

## Phase 5: testing and QA

### QA or Engineer

| Command                                      | Type  | Description                                                                        |
|----------------------------------------------|-------|------------------------------------------------------------------------------------|
| `tdd`                                        | skill | Drive features and fixes test-first.                                               |
| `verify`                                     | skill | Exercise the affected flow end to end and observe real behavior before committing. |
| `diagnosing-bugs`                            | skill | Structured diagnosis loop for hard bugs and performance regressions.               |
| `playwright-cli`                             | skill | Automate browser interactions and run Playwright tests.                            |
| `chrome-devtools-mcp`                        | skill | Drive and inspect a real browser through Chrome DevTools.                          |
| `astral:ty`                                  | skill | Catch type errors before they reach runtime.                                       |
| `iterative-development:auditing-progress`    | skill | Verify behavior-evidence quality across current, impacted, and sentinel scenarios. |
| `iterative-development:running-an-iteration` | skill | Run an iteration: baseline, implement, then impacted and sentinel scenario checks. |

## Phase 6: build, release and CI/CD

### Engineer or Release

| Command                         | Type    | Description                                                                 |
|---------------------------------|---------|-----------------------------------------------------------------------------|
| `/git:commit`                   | command | Create a git commit (stage all, single commit).                             |
| `/git:multiple`                 | command | Split changes into a logical sequence of commits.                           |
| `/git:push`                     | command | Commit and push.                                                            |
| `/git:pr`                       | command | Commit, push, and open a pull request.                                      |
| `/git:changelog`                | command | Generate a changelog for a time period (day, week, month, year, or N days). |
| `/git:branches`                 | command | Delete stale local branches whose remote tracking branch is gone.           |
| `/git:worktrees`                | command | Remove worktrees whose branch is gone on the remote, then delete them.      |
| `/git:amend-author`             | command | Rewrite the author of the whole branch or the last N commits.               |
| `/git:amend-date`               | command | Set an absolute commit and author date on the most recent commit.           |
| `/git:shift-dates`              | command | Shift the last N commit dates by a number of hours.                         |
| `resolving-merge-conflicts`     | skill   | Work through an in-progress git merge or rebase conflict.                   |
| `gh-cli`                        | skill   | Comprehensive `gh` reference for repos, PRs, Actions, releases, and more.   |
| `glab`                          | skill   | GitLab CLI operations.                                                      |
| `/issues:github-coding-process` | command | Plan, implement, test, and ship a GitHub issue end to end using `gh`.       |
| `terraform-skill`               | skill   | Terraform CI, scans, and state operations in the pipeline.                  |

## Phase 7: deploy and operate

### DevOps or SRE

| Command                  | Type  | Description                                                                    |
|--------------------------|-------|--------------------------------------------------------------------------------|
| `schedule`               | skill | Create and manage scheduled cloud agents (routines) on a cron schedule.        |
| `loop`                   | skill | Run a prompt or slash command on a recurring interval, or poll for status.     |
| `terraform-skill`        | skill | Apply and manage infrastructure state.                                         |
| `neon-postgres-branches` | skill | Spin up isolated database branches for staging and test environments.          |
| `cloudflare`             | skill | Deploy and operate Cloudflare edge resources.                                  |
| `update-config`          | skill | Configure the Claude Code harness: permissions, env vars, and automated hooks. |

## Phase 8: maintain and document

### Engineer

| Command                         | Type  | Description                                                                               |
|---------------------------------|-------|-------------------------------------------------------------------------------------------|
| `legacy-modernizer`             | agent | Refactor legacy code, migrate frameworks, and pay down technical debt (code-refactoring). |
| `improve-codebase-architecture` | skill | Reshape an existing codebase toward a cleaner architecture.                               |
| `diagnosing-bugs`               | skill | Diagnose regressions and hard bugs in maintained code.                                    |
| `simplify`                      | skill | Trim reuse, complexity, and dead flexibility from existing code.                          |
| `code-simplifier`               | agent | Simplify code for clarity and maintainability while preserving behavior.                  |

### Tech writer

| Command                   | Type    | Description                                                           |
|---------------------------|---------|-----------------------------------------------------------------------|
| `/simple:markitdown`      | command | Convert files (PDF, Office, images, audio, HTML) to Markdown.         |
| `/simple:proofread`       | command | Proofread text for spelling, grammar, and readability.                |
| `meeting-summarizer`      | skill   | Turn a meeting or interview transcript into structured English notes. |
| `/summarize:transscripts` | command | Summarize a meeting or transcript into sections with action items.    |
| `teach`                   | skill   | Explain a concept or codebase area for onboarding.                    |
| `handoff`                 | skill   | Capture session state so work can be picked up later.                 |
| `writing-great-skills`    | skill   | Author well-structured skills for this environment.                   |
| `init`                    | skill   | Document the codebase into a `CLAUDE.md`.                             |

## Cross-cutting (every phase)

These apply regardless of which phase you are in.

| Command                    | Type   | Description                                                                            |
|----------------------------|--------|----------------------------------------------------------------------------------------|
| `caveman`                  | skill  | Ultra-compressed communication mode to cut token usage while keeping substance.        |
| `ponytail`                 | skill  | Force the simplest solution that works: stdlib and native features before custom code. |
| `context7:docs`            | skill  | Fetch current documentation for any library, framework, or SDK.                        |
| `install-mcp`              | skill  | Add a project-scoped MCP server to the repo.                                           |
| `update-config`            | skill  | Change harness settings, permissions, and hooks.                                       |
| `keybindings-help`         | skill  | Customize keyboard shortcuts and chord bindings.                                       |
| `fewer-permission-prompts` | skill  | Build an allowlist from transcripts to cut repeat permission prompts.                  |
| `claude-api`               | skill  | Reference for the Claude API and Anthropic SDK (models, pricing, tool use).            |
| `dataviz`                  | skill  | Design guidance for any chart, dashboard, or data visualization.                       |
| `watch:watch`              | skill  | Watch a video (tutorial, demo) and answer questions about its content.                 |
| `notion-workspace-plugin`  | plugin | Read and write a Notion workspace as a knowledge base.                                 |

## Inventory by install source

The same tools, regrouped by how they got here. This is the answer to "installed manually, by skills, or by plugins." The source of truth for each channel is the file named in its heading, not this list, since the sets drift.

### Manually committed (chezmoi, this repo)

Plain files committed under `dot_claude/` and laid into `~/.claude` by `just chezmoi`. Slash commands live in [`dot_claude/commands/`](../dot_claude/commands/README.md); local skills in [`dot_claude/skills/`](../dot_claude/skills/).

Slash commands: `/git:commit`, `/git:multiple`, `/git:push`, `/git:pr`, `/git:changelog`, `/git:branches`, `/git:worktrees`, `/git:amend-author`, `/git:amend-date`, `/git:shift-dates`, `/organize:*` (eight header-style variants), `/issues:improve-issue`, `/issues:improve-issue-in-place`, `/issues:github-coding-process`, `/summarize:transscripts`, `/simple:explain`, `/simple:proofread`, `/simple:markitdown`.

Local skills: `gh-cli`, `install-mcp`, `meeting-summarizer`, `organize`.

### By APM skill bundles (`apm.yml`)

Third-party skills pulled by `apm install`, which re-resolves to latest upstream on every run. The full per-skill mapping with upstream URLs is in [`docs/agents/skills.md`](agents/skills.md).

Matt Pocock bundle (`mattpocock/skills`): `grilling`, `grill-me`, `grill-with-docs`, `codebase-design`, `domain-modeling`, `wayfinder`, `handoff`, `improve-codebase-architecture`, `setup-matt-pocock-skills`, `tdd`, `triage`, `to-tickets`, `to-spec`, `implement`, `code-review`, `research`, `prototype`, `ask-matt`, `diagnosing-bugs`, `resolving-merge-conflicts`, `teach`, `writing-great-skills`. The sibling skills `to-prd` and `to-issues` also resolve from this bundle on disk though they are not in the explicit `apm.yml` list.

Other bundles: `terraform-skill` (`antonbabenko/terraform-skill`), and `neon`, `neon-postgres`, `neon-postgres-branches` (`neondatabase/agent-skills`).

### By standalone CLI

Installed by a vendor CLI that ships with a companion binary, see [`scripts/extensions/skills/install.sh`](../scripts/extensions/skills/install.sh): `playwright-cli` (via `playwright-cli install --skills`) and `orbit` (via `glab skills install`).

### By Claude plugins (`claude plugin install`)

Bundled inside plugins from various marketplaces. The install script with each source repo is [`scripts/extensions/plugins/install.sh`](../scripts/extensions/plugins/install.sh); the reasoning on which plugins could move to APM is in [`docs/apm/plugin-migration.md`](apm/plugin-migration.md).

- `code-review` (official): `/code-review:code-review`.
- `feature-dev` (official): `/feature-dev:feature-dev`, plus agents `code-architect`, `code-explorer`, `code-reviewer`.
- `code-simplifier` (official): `code-simplifier` agent.
- `iterative-development` (prime-radiant): the `iterative-development:*` skills.
- `greenfield` (prime-radiant): `greenfield:analyze`, `greenfield:sanitize`.
- `context7` (upstash): `context7:docs` plus the context7 MCP server.
- `code-refactoring` (wshobson/agents): agents `code-reviewer`, `legacy-modernizer`.
- `ast-grep`: `ast-grep:ast-grep`.
- `astral`: `astral:ruff`, `astral:ty`, `astral:uv`.
- `codex` (openai): `codex:rescue`, `codex:setup`, and the codex-rescue agent.
- `caveman`: `caveman`, `caveman-review`, `caveman-help`, `compress`.
- `ponytail`: `ponytail`, `ponytail-review`, `ponytail-audit`, `ponytail-debt`, and helpers.
- `pyright` (piebald-ai LSP marketplace): the pyright LSP server.
- `watch` (claude-video): `watch:watch`.
- `glab` (gitlab): GitLab CLI skills.
- `cloudflare`: Cloudflare skills.
- `chrome-devtools-mcp`: browser automation MCP.
- `notion-workspace-plugin`: Notion workspace access.

### Built into Claude Code

Shipped with the harness, no install step: `init`, `run`, `verify`, `simplify`, `review`, `security-review`, `loop`, `schedule`, `update-config`, `keybindings-help`, `claude-api`, `fewer-permission-prompts`, `dataviz`, `deep-research`, `artifact-design`, `artifact-capabilities`.
