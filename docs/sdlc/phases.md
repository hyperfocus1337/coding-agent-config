# SDLC command map: phases

This page maps the slash commands, skills, and subagents installed in this environment onto the phases of the software development lifecycle (SDLC). The goal is a practical answer to one question: at any point in building software, which installed tools can I reach for. Entries are grouped by SDLC phase, and within each phase into categories of related tools. A tool that genuinely serves more than one phase is listed under each phase it fits, so every phase table stands on its own.

Two conventions keep the tables lean. Slash commands are recognizable by their leading `/` prefix (for example `/git:commit`), so there is no separate column marking commands apart from skills. Subagents are called out in their own description: any entry whose description begins with "Subagent that" is dispatched through the Agent tool and spawns a separate agent rather than running inline.

Where each tool comes from (manually committed, pulled by APM, a standalone CLI, a Claude plugin, or built into Claude Code) is documented separately in [`inventory.md`](../sources/inventory.md). Each name below links to the same source as its `inventory.md` row (repo file, upstream repo, or docs page); a few entries with no public source are left unlinked.

## The phases

The lifecycle used here has eight phases. Each phase groups its tools into a few categories of related work.

| Phase                       | What happens                                                                              |
|-----------------------------|-------------------------------------------------------------------------------------------|
| 1. Plan and requirements    | Gather requirements, shape issues and specs, stress-test the idea, orient in the codebase |
| 2. Design and architecture  | Domain modeling, module design, prototypes, analysis of existing code                     |
| 3. Implementation           | Write code, build features test-first, wire databases and infrastructure                  |
| 4. Code review              | Full and focused review, security review, over-engineering audits                         |
| 5. Testing and QA           | Verify behavior end to end, browser automation, evidence corpus, bug diagnosis            |
| 6. Build, release and CI/CD | Commit hygiene, branch and history cleanup, merges, pull requests, release plumbing       |
| 7. Deploy and operate       | Scheduled agents, recurring jobs, infrastructure and database operations                  |
| 8. Maintain and document    | Modernize legacy code, refactor, write and summarize documentation                        |

A set of cross-cutting tools that apply to every phase (output compression, simplicity enforcement, harness configuration, documentation lookup) is listed once in its own [cross-cutting section](#cross-cutting-every-phase) rather than repeated under all eight.

## Phase 1: plan and requirements

### Requirements and specs

| Command                                                                                               | Description                                                              |
|-------------------------------------------------------------------------------------------------------|--------------------------------------------------------------------------|
| [`/issues:improve-issue`](../../dot_claude/commands/issues/improve-issue.md)                          | Rewrite a GitHub issue to be clearer and more actionable (outputs text). |
| [`/issues:improve-issue-in-place`](../../dot_claude/commands/issues/improve-issue-in-place.md)        | Same rewrite, applied directly to the issue via `gh`.                    |
| [`to-spec`](https://github.com/mattpocock/skills/blob/main/skills/engineering/to-spec/SKILL.md)       | Turn settled intent into a written behavioral spec.                      |
| [`to-tickets`](https://github.com/mattpocock/skills/blob/main/skills/engineering/to-tickets/SKILL.md) | Break a spec into discrete, buildable tickets.                           |
| [`triage`](https://github.com/mattpocock/skills/blob/main/skills/engineering/triage/SKILL.md)         | Triage and prioritize incoming work.                                     |

### Idea stress-testing

| Command                                                                                                         | Description                                                                 |
|-----------------------------------------------------------------------------------------------------------------|-----------------------------------------------------------------------------|
| [`grilling`](https://github.com/mattpocock/skills/blob/main/skills/productivity/grilling/SKILL.md)              | Relentlessly stress-test a plan, decision, or idea before committing to it. |
| [`grill-me`](https://github.com/mattpocock/skills/blob/main/skills/productivity/grill-me/SKILL.md)              | Be interrogated on your own reasoning to surface gaps.                      |
| [`grill-with-docs`](https://github.com/mattpocock/skills/blob/main/skills/engineering/grill-with-docs/SKILL.md) | Interrogate an idea against real documentation.                             |

### Research and orientation

| Command                                                                                             | Description                                                                     |
|-----------------------------------------------------------------------------------------------------|---------------------------------------------------------------------------------|
| [`research`](https://github.com/mattpocock/skills/blob/main/skills/engineering/research/SKILL.md)   | Investigate a question against high-trust primary sources and capture findings. |
| `deep-research`                                                                                     | Fan-out web research with adversarial verification into a cited report.         |
| [`wayfinder`](https://github.com/mattpocock/skills/blob/main/skills/engineering/wayfinder/SKILL.md) | Orient quickly in an unfamiliar codebase.                                       |
| [`init`](https://code.claude.com/docs/en/slash-commands)                                            | Initialize a `CLAUDE.md` documenting the codebase for future sessions.          |

## Phase 2: design and architecture

### Module and domain design

| Command                                                                                                                                     | Description                                                                |
|---------------------------------------------------------------------------------------------------------------------------------------------|----------------------------------------------------------------------------|
| [`codebase-design`](https://github.com/mattpocock/skills/blob/main/skills/engineering/codebase-design/SKILL.md)                             | Shared vocabulary for designing deep modules and placing seams.            |
| [`domain-modeling`](https://github.com/mattpocock/skills/blob/main/skills/engineering/domain-modeling/SKILL.md)                             | Build a ubiquitous language and record architectural decisions (ADRs).     |
| [`improve-codebase-architecture`](https://github.com/mattpocock/skills/blob/main/skills/engineering/improve-codebase-architecture/SKILL.md) | Assess and improve the architecture of an existing codebase.               |
| [`prototype`](https://github.com/mattpocock/skills/blob/main/skills/engineering/prototype/SKILL.md)                                         | Build a throwaway prototype to sanity-check a state model or UI direction. |

### Codebase analysis

| Command                                                                                             | Description                                                                                          |
|-----------------------------------------------------------------------------------------------------|------------------------------------------------------------------------------------------------------|
| [`code-architect`](https://github.com/anthropics/claude-code/tree/main/plugins/feature-dev)         | Subagent that produces an implementation blueprint from existing codebase patterns (feature-dev).    |
| [`code-explorer`](https://github.com/anthropics/claude-code/tree/main/plugins/feature-dev)          | Subagent that traces execution paths and maps the architecture of an existing feature (feature-dev). |
| [`wayfinder`](https://github.com/mattpocock/skills/blob/main/skills/engineering/wayfinder/SKILL.md) | Map the terrain before proposing where a change fits.                                                |

### Design inputs

| Command                                                                                            | Description                                                               |
|----------------------------------------------------------------------------------------------------|---------------------------------------------------------------------------|
| [`research`](https://github.com/mattpocock/skills/blob/main/skills/engineering/research/SKILL.md)  | Gather primary-source facts to back a design decision.                    |
| [`grilling`](https://github.com/mattpocock/skills/blob/main/skills/productivity/grilling/SKILL.md) | Stress-test the chosen design against its weakest assumptions.            |
| [`context7:docs`](https://github.com/upstash/context7)                                             | Pull current library and framework docs to inform design choices.         |
| [`install-mcp`](../../dot_claude/skills/install-mcp/SKILL.md)                                      | Wire a project-scoped MCP server into the repo when the design needs one. |

## Phase 3: implementation

### Building features

| Command                                                                                               | Description                                                                    |
|-------------------------------------------------------------------------------------------------------|--------------------------------------------------------------------------------|
| [`/feature-dev:feature-dev`](https://github.com/anthropics/claude-code/tree/main/plugins/feature-dev) | Guided feature development with codebase understanding and architecture focus. |
| [`implement`](https://github.com/mattpocock/skills/blob/main/skills/engineering/implement/SKILL.md)   | Build a single ticket to completion.                                           |
| [`tdd`](https://github.com/mattpocock/skills/blob/main/skills/engineering/tdd/SKILL.md)               | Test-driven development with a red-green-refactor loop.                        |
| [`prototype`](https://github.com/mattpocock/skills/blob/main/skills/engineering/prototype/SKILL.md)   | Explore an approach with throwaway code before committing to it.               |

### Code intelligence and search

| Command                                                          | Description                                                            |
|------------------------------------------------------------------|------------------------------------------------------------------------|
| [`ast-grep:ast-grep`](https://github.com/ast-grep/agent-skill)   | Structural code search and rewrite across the codebase by AST pattern. |
| [`context7:docs`](https://github.com/upstash/context7)           | Look up exact API syntax and config while writing code.                |
| [`/simple:explain`](../../dot_claude/commands/simple/explain.md) | Explain a code snippet step by step.                                   |

### Python tooling

| Command                                                                                    | Description                                     |
|--------------------------------------------------------------------------------------------|-------------------------------------------------|
| [`astral:ruff`](https://github.com/astral-sh/claude-code-plugins/tree/main/plugins/astral) | Fast Python linting and formatting.             |
| [`astral:ty`](https://github.com/astral-sh/claude-code-plugins/tree/main/plugins/astral)   | Fast Python type checking.                      |
| [`astral:uv`](https://github.com/astral-sh/claude-code-plugins/tree/main/plugins/astral)   | Python package, project, and script management. |

### Running and rescue

| Command                                                     | Description                                                                          |
|-------------------------------------------------------------|--------------------------------------------------------------------------------------|
| `run`                                                       | Launch and drive the app to see a change working in the real thing.                  |
| [`codex:rescue`](https://github.com/openai/codex-plugin-cc) | Subagent that hands a stuck or heavy task to Codex for a second implementation pass. |

### Config file hygiene

| Command                                              | Description                                                                          |
|------------------------------------------------------|--------------------------------------------------------------------------------------|
| [`/organize:*`](../../dot_claude/commands/organize/) | Section a config or code file under comment-delimited headers (eight header styles). |

### Data and infrastructure

| Command                                                                                                          | Description                                                                   |
|------------------------------------------------------------------------------------------------------------------|-------------------------------------------------------------------------------|
| [`neon`](https://github.com/neondatabase/agent-skills)                                                           | Overview of the Neon platform (Postgres, Auth, Data API, storage, functions). |
| [`neon-postgres`](https://github.com/neondatabase/agent-skills)                                                  | Setup and best practices for Neon serverless Postgres.                        |
| [`neon-postgres-branches`](https://github.com/neondatabase/agent-skills)                                         | Create the right Neon branch type for dev and test workflows.                 |
| [`terraform-skill`](https://github.com/antonbabenko/terraform-skill/blob/master/skills/terraform-skill/SKILL.md) | Write, review, and debug Terraform or OpenTofu modules.                       |
| [`cloudflare`](https://github.com/cloudflare/skills)                                                             | Cloudflare platform skills for building on the edge.                          |

## Phase 4: code review

### Full review

| Command                                                                                                 | Description                                                                 |
|---------------------------------------------------------------------------------------------------------|-----------------------------------------------------------------------------|
| [`/code-review:code-review`](https://github.com/anthropics/claude-code/tree/main/plugins/code-review)   | Code review a pull request (official plugin).                               |
| [`code-review`](https://github.com/mattpocock/skills/blob/main/skills/engineering/code-review/SKILL.md) | Review a branch on two axes: repo standards and originating-spec adherence. |
| [`/review`](https://code.claude.com/docs/en/slash-commands)                                             | Review a GitHub pull request.                                               |

### Focused review

| Command                                                             | Description                                                                       |
|---------------------------------------------------------------------|-----------------------------------------------------------------------------------|
| [`security-review`](https://code.claude.com/docs/en/slash-commands) | Security review of the pending changes on the current branch.                     |
| `simplify`                                                          | Review changed code for reuse and simplification, then apply the fixes.           |
| [`ponytail-review`](https://github.com/DietrichGebert/ponytail)     | Review a diff purely for over-engineering: what to delete or replace with stdlib. |
| [`ponytail-audit`](https://github.com/DietrichGebert/ponytail)      | Whole-repo over-engineering audit with a ranked list of what to cut.              |
| [`caveman-review`](https://github.com/JuliusBrussee/caveman)        | Compressed one-line-per-finding PR review comments.                               |

### Review agents

| Command                                                                                    | Description                                                                                                      |
|--------------------------------------------------------------------------------------------|------------------------------------------------------------------------------------------------------------------|
| [`code-reviewer`](https://github.com/anthropics/claude-code/tree/main/plugins/feature-dev) | Subagent that reviews for bugs, security, performance, and convention adherence (feature-dev, code-refactoring). |

## Phase 5: testing and QA

### Test-driven and verification

| Command                                                                                 | Description                                                                        |
|-----------------------------------------------------------------------------------------|------------------------------------------------------------------------------------|
| [`tdd`](https://github.com/mattpocock/skills/blob/main/skills/engineering/tdd/SKILL.md) | Drive features and fixes test-first.                                               |
| `verify`                                                                                | Exercise the affected flow end to end and observe real behavior before committing. |

### Browser testing

| Command                                                                        | Description                                               |
|--------------------------------------------------------------------------------|-----------------------------------------------------------|
| [`playwright-cli`](https://github.com/microsoft/playwright-cli)                | Automate browser interactions and run Playwright tests.   |
| [`chrome-devtools-mcp`](https://github.com/ChromeDevTools/chrome-devtools-mcp) | Drive and inspect a real browser through Chrome DevTools. |

### Bug diagnosis

| Command                                                                                                         | Description                                                          |
|-----------------------------------------------------------------------------------------------------------------|----------------------------------------------------------------------|
| [`diagnosing-bugs`](https://github.com/mattpocock/skills/blob/main/skills/engineering/diagnosing-bugs/SKILL.md) | Structured diagnosis loop for hard bugs and performance regressions. |
| [`astral:ty`](https://github.com/astral-sh/claude-code-plugins/tree/main/plugins/astral)                        | Catch type errors before they reach runtime.                         |

### Evidence and iteration

| Command                                                                                                    | Description                                                                        |
|------------------------------------------------------------------------------------------------------------|------------------------------------------------------------------------------------|
| [`iterative-development:auditing-progress`](https://github.com/prime-radiant-inc/iterative-development)    | Verify behavior-evidence quality across current, impacted, and sentinel scenarios. |
| [`iterative-development:running-an-iteration`](https://github.com/prime-radiant-inc/iterative-development) | Run an iteration: baseline, implement, then impacted and sentinel scenario checks. |

## Phase 6: build, release and CI/CD

### Commits and pull requests

| Command                                                                                      | Description                                                           |
|----------------------------------------------------------------------------------------------|-----------------------------------------------------------------------|
| [`/git:commit`](../../dot_claude/commands/git/commit.md)                                     | Create a git commit (stage all, single commit).                       |
| [`/git:multiple`](../../dot_claude/commands/git/multiple.md)                                 | Split changes into a logical sequence of commits.                     |
| [`/git:push`](../../dot_claude/commands/git/push.md)                                         | Commit and push.                                                      |
| [`/git:pr`](../../dot_claude/commands/git/pr.md)                                             | Commit, push, and open a pull request.                                |
| [`/issues:github-coding-process`](../../dot_claude/commands/issues/github-coding-process.md) | Plan, implement, test, and ship a GitHub issue end to end using `gh`. |

### Branch and history hygiene

| Command                                                              | Description                                                            |
|----------------------------------------------------------------------|------------------------------------------------------------------------|
| [`/git:branches`](../../dot_claude/commands/git/branches.md)         | Delete stale local branches whose remote tracking branch is gone.      |
| [`/git:worktrees`](../../dot_claude/commands/git/worktrees.md)       | Remove worktrees whose branch is gone on the remote, then delete them. |
| [`/git:amend-author`](../../dot_claude/commands/git/amend-author.md) | Rewrite the author of the whole branch or the last N commits.          |
| [`/git:amend-date`](../../dot_claude/commands/git/amend-date.md)     | Set an absolute commit and author date on the most recent commit.      |
| [`/git:shift-dates`](../../dot_claude/commands/git/shift-dates.md)   | Shift the last N commit dates by a number of hours.                    |

### Merge and platform

| Command                                                                                                                             | Description                                                               |
|-------------------------------------------------------------------------------------------------------------------------------------|---------------------------------------------------------------------------|
| [`resolving-merge-conflicts`](https://github.com/mattpocock/skills/blob/main/skills/engineering/resolving-merge-conflicts/SKILL.md) | Work through an in-progress git merge or rebase conflict.                 |
| [`gh-cli`](../../dot_claude/skills/gh-cli/SKILL.md)                                                                                 | Comprehensive `gh` reference for repos, PRs, Actions, releases, and more. |
| [`glab`](https://gitlab.com/gitlab-org/ai/skills)                                                                                   | GitLab CLI operations.                                                    |

### Release plumbing

| Command                                                                                                          | Description                                                                 |
|------------------------------------------------------------------------------------------------------------------|-----------------------------------------------------------------------------|
| [`/git:changelog`](../../dot_claude/commands/git/changelog.md)                                                   | Generate a changelog for a time period (day, week, month, year, or N days). |
| [`terraform-skill`](https://github.com/antonbabenko/terraform-skill/blob/master/skills/terraform-skill/SKILL.md) | Terraform CI, scans, and state operations in the pipeline.                  |

## Phase 7: deploy and operate

### Scheduling and recurring jobs

| Command                                                   | Description                                                                |
|-----------------------------------------------------------|----------------------------------------------------------------------------|
| [`schedule`](https://code.claude.com/docs/en/routines)    | Create and manage scheduled cloud agents (routines) on a cron schedule.    |
| [`loop`](https://code.claude.com/docs/en/scheduled-tasks) | Run a prompt or slash command on a recurring interval, or poll for status. |

### Infrastructure and data ops

| Command                                                                                                          | Description                                                           |
|------------------------------------------------------------------------------------------------------------------|-----------------------------------------------------------------------|
| [`terraform-skill`](https://github.com/antonbabenko/terraform-skill/blob/master/skills/terraform-skill/SKILL.md) | Apply and manage infrastructure state.                                |
| [`neon-postgres-branches`](https://github.com/neondatabase/agent-skills)                                         | Spin up isolated database branches for staging and test environments. |
| [`cloudflare`](https://github.com/cloudflare/skills)                                                             | Deploy and operate Cloudflare edge resources.                         |

### Harness config

| Command                                                     | Description                                                                    |
|-------------------------------------------------------------|--------------------------------------------------------------------------------|
| [`update-config`](https://code.claude.com/docs/en/settings) | Configure the Claude Code harness: permissions, env vars, and automated hooks. |

## Phase 8: maintain and document

### Refactor and modernize

| Command                                                                                                                                     | Description                                                                                                |
|---------------------------------------------------------------------------------------------------------------------------------------------|------------------------------------------------------------------------------------------------------------|
| [`legacy-modernizer`](https://github.com/wshobson/agents/tree/main/plugins/code-refactoring)                                                | Subagent that refactors legacy code, migrates frameworks, and pays down technical debt (code-refactoring). |
| [`code-simplifier`](https://github.com/anthropics/claude-plugins-official/tree/main/plugins/code-simplifier)                                | Subagent that simplifies code for clarity and maintainability while preserving behavior.                   |
| [`improve-codebase-architecture`](https://github.com/mattpocock/skills/blob/main/skills/engineering/improve-codebase-architecture/SKILL.md) | Reshape an existing codebase toward a cleaner architecture.                                                |
| [`diagnosing-bugs`](https://github.com/mattpocock/skills/blob/main/skills/engineering/diagnosing-bugs/SKILL.md)                             | Diagnose regressions and hard bugs in maintained code.                                                     |
| `simplify`                                                                                                                                  | Trim reuse, complexity, and dead flexibility from existing code.                                           |

### Documentation

| Command                                                                                                                    | Description                                                           |
|----------------------------------------------------------------------------------------------------------------------------|-----------------------------------------------------------------------|
| [`/simple:markitdown`](../../dot_claude/commands/simple/markitdown.md)                                                     | Convert files (PDF, Office, images, audio, HTML) to Markdown.         |
| [`/simple:proofread`](../../dot_claude/commands/simple/proofread.md)                                                       | Proofread text for spelling, grammar, and readability.                |
| [`meeting-summarizer`](../../dot_claude/skills/meeting-summarizer/SKILL.md)                                                | Turn a meeting or interview transcript into structured English notes. |
| [`/summarize:transscripts`](../../dot_claude/commands/summarize/transscripts.md)                                           | Summarize a meeting or transcript into sections with action items.    |
| [`teach`](https://github.com/mattpocock/skills/blob/main/skills/productivity/teach/SKILL.md)                               | Explain a concept or codebase area for onboarding.                    |
| [`handoff`](https://github.com/mattpocock/skills/blob/main/skills/productivity/handoff/SKILL.md)                           | Capture session state so work can be picked up later.                 |
| [`writing-great-skills`](https://github.com/mattpocock/skills/blob/main/skills/productivity/writing-great-skills/SKILL.md) | Author well-structured skills for this environment.                   |
| [`init`](https://code.claude.com/docs/en/slash-commands)                                                                   | Document the codebase into a `CLAUDE.md`.                             |

## Cross-cutting (every phase)

These apply regardless of which phase you are in.

| Command                                                                              | Description                                                                            |
|--------------------------------------------------------------------------------------|----------------------------------------------------------------------------------------|
| [`caveman`](https://github.com/JuliusBrussee/caveman)                                | Ultra-compressed communication mode to cut token usage while keeping substance.        |
| [`ponytail`](https://github.com/DietrichGebert/ponytail)                             | Force the simplest solution that works: stdlib and native features before custom code. |
| [`context7:docs`](https://github.com/upstash/context7)                               | Fetch current documentation for any library, framework, or SDK.                        |
| [`install-mcp`](../../dot_claude/skills/install-mcp/SKILL.md)                        | Add a project-scoped MCP server to the repo.                                           |
| [`update-config`](https://code.claude.com/docs/en/settings)                          | Change harness settings, permissions, and hooks.                                       |
| [`keybindings-help`](https://code.claude.com/docs/en/interactive-mode)               | Customize keyboard shortcuts and chord bindings.                                       |
| [`fewer-permission-prompts`](https://code.claude.com/docs/en/permissions)            | Build an allowlist from transcripts to cut repeat permission prompts.                  |
| `claude-api`                                                                         | Reference for the Claude API and Anthropic SDK (models, pricing, tool use).            |
| `dataviz`                                                                            | Design guidance for any chart, dashboard, or data visualization.                       |
| [`watch:watch`](https://github.com/bradautomates/claude-video)                       | Watch a video (tutorial, demo) and answer questions about its content.                 |
| [`notion-workspace-plugin`](https://github.com/makenotion/claude-code-notion-plugin) | Read and write a Notion workspace as a knowledge base.                                 |
