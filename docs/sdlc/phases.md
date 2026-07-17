# SDLC command map: phases

This page maps the slash commands, skills, and subagents installed in this environment onto the phases of the software development lifecycle (SDLC). The goal is a practical answer to one question: at any point in building software, which installed tools can I reach for. Entries are grouped by SDLC phase, and within each phase into categories of related tools. A tool that genuinely serves more than one phase is listed under each phase it fits, so every phase table stands on its own.

Two conventions keep the tables lean. Slash commands are recognizable by their leading `/` prefix (for example `/git:commit`), so there is no separate column marking commands apart from skills. Subagents are called out in their own description: any entry whose description begins with "Subagent that" is dispatched through the Agent tool and spawns a separate agent rather than running inline.

Where each tool comes from (manually committed, pulled by APM, a standalone CLI, a Claude plugin, or built into Claude Code) is documented separately in [`inventory.md`](../sources/inventory.md).

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

| Command                          | Description                                                              |
|----------------------------------|--------------------------------------------------------------------------|
| `/issues:improve-issue`          | Rewrite a GitHub issue to be clearer and more actionable (outputs text). |
| `/issues:improve-issue-in-place` | Same rewrite, applied directly to the issue via `gh`.                    |
| `to-prd`                         | Turn a rough intent into a product requirements document.                |
| `to-spec`                        | Turn settled intent into a written behavioral spec.                      |
| `to-tickets`                     | Break a spec into discrete, buildable tickets.                           |
| `to-issues`                      | Break the work into GitHub issues.                                       |
| `triage`                         | Triage and prioritize incoming work.                                     |

### Idea stress-testing

| Command           | Description                                                                 |
|-------------------|-----------------------------------------------------------------------------|
| `grilling`        | Relentlessly stress-test a plan, decision, or idea before committing to it. |
| `grill-me`        | Be interrogated on your own reasoning to surface gaps.                      |
| `grill-with-docs` | Interrogate an idea against real documentation.                             |

### Research and orientation

| Command         | Description                                                                     |
|-----------------|---------------------------------------------------------------------------------|
| `research`      | Investigate a question against high-trust primary sources and capture findings. |
| `deep-research` | Fan-out web research with adversarial verification into a cited report.         |
| `wayfinder`     | Orient quickly in an unfamiliar codebase.                                       |
| `init`          | Initialize a `CLAUDE.md` documenting the codebase for future sessions.          |

## Phase 2: design and architecture

### Module and domain design

| Command                         | Description                                                                |
|---------------------------------|----------------------------------------------------------------------------|
| `codebase-design`               | Shared vocabulary for designing deep modules and placing seams.            |
| `domain-modeling`               | Build a ubiquitous language and record architectural decisions (ADRs).     |
| `improve-codebase-architecture` | Assess and improve the architecture of an existing codebase.               |
| `prototype`                     | Build a throwaway prototype to sanity-check a state model or UI direction. |

### Codebase analysis

| Command          | Description                                                                                          |
|------------------|------------------------------------------------------------------------------------------------------|
| `code-architect` | Subagent that produces an implementation blueprint from existing codebase patterns (feature-dev).    |
| `code-explorer`  | Subagent that traces execution paths and maps the architecture of an existing feature (feature-dev). |
| `wayfinder`      | Map the terrain before proposing where a change fits.                                                |

### Design inputs

| Command         | Description                                                               |
|-----------------|---------------------------------------------------------------------------|
| `research`      | Gather primary-source facts to back a design decision.                    |
| `grilling`      | Stress-test the chosen design against its weakest assumptions.            |
| `context7:docs` | Pull current library and framework docs to inform design choices.         |
| `install-mcp`   | Wire a project-scoped MCP server into the repo when the design needs one. |

## Phase 3: implementation

### Building features

| Command                    | Description                                                                    |
|----------------------------|--------------------------------------------------------------------------------|
| `/feature-dev:feature-dev` | Guided feature development with codebase understanding and architecture focus. |
| `implement`                | Build a single ticket to completion.                                           |
| `tdd`                      | Test-driven development with a red-green-refactor loop.                        |
| `prototype`                | Explore an approach with throwaway code before committing to it.               |

### Code intelligence and search

| Command             | Description                                                            |
|---------------------|------------------------------------------------------------------------|
| `ast-grep:ast-grep` | Structural code search and rewrite across the codebase by AST pattern. |
| `context7:docs`     | Look up exact API syntax and config while writing code.                |
| `/simple:explain`   | Explain a code snippet step by step.                                   |

### Python tooling

| Command       | Description                                     |
|---------------|-------------------------------------------------|
| `astral:ruff` | Fast Python linting and formatting.             |
| `astral:ty`   | Fast Python type checking.                      |
| `astral:uv`   | Python package, project, and script management. |

### Running and rescue

| Command        | Description                                                                          |
|----------------|--------------------------------------------------------------------------------------|
| `run`          | Launch and drive the app to see a change working in the real thing.                  |
| `codex:rescue` | Subagent that hands a stuck or heavy task to Codex for a second implementation pass. |

### Config file hygiene

| Command       | Description                                                                          |
|---------------|--------------------------------------------------------------------------------------|
| `/organize:*` | Section a config or code file under comment-delimited headers (eight header styles). |

### Data and infrastructure

| Command                  | Description                                                                   |
|--------------------------|-------------------------------------------------------------------------------|
| `neon`                   | Overview of the Neon platform (Postgres, Auth, Data API, storage, functions). |
| `neon-postgres`          | Setup and best practices for Neon serverless Postgres.                        |
| `neon-postgres-branches` | Create the right Neon branch type for dev and test workflows.                 |
| `terraform-skill`        | Write, review, and debug Terraform or OpenTofu modules.                       |
| `cloudflare`             | Cloudflare platform skills for building on the edge.                          |

## Phase 4: code review

### Full review

| Command                    | Description                                                                 |
|----------------------------|-----------------------------------------------------------------------------|
| `/code-review:code-review` | Code review a pull request (official plugin).                               |
| `code-review`              | Review a branch on two axes: repo standards and originating-spec adherence. |
| `/review`                  | Review a GitHub pull request.                                               |

### Focused review

| Command           | Description                                                                       |
|-------------------|-----------------------------------------------------------------------------------|
| `security-review` | Security review of the pending changes on the current branch.                     |
| `simplify`        | Review changed code for reuse and simplification, then apply the fixes.           |
| `ponytail-review` | Review a diff purely for over-engineering: what to delete or replace with stdlib. |
| `ponytail-audit`  | Whole-repo over-engineering audit with a ranked list of what to cut.              |
| `caveman-review`  | Compressed one-line-per-finding PR review comments.                               |

### Review agents

| Command         | Description                                                                                                      |
|-----------------|------------------------------------------------------------------------------------------------------------------|
| `code-reviewer` | Subagent that reviews for bugs, security, performance, and convention adherence (feature-dev, code-refactoring). |

## Phase 5: testing and QA

### Test-driven and verification

| Command  | Description                                                                        |
|----------|------------------------------------------------------------------------------------|
| `tdd`    | Drive features and fixes test-first.                                               |
| `verify` | Exercise the affected flow end to end and observe real behavior before committing. |

### Browser testing

| Command               | Description                                               |
|-----------------------|-----------------------------------------------------------|
| `playwright-cli`      | Automate browser interactions and run Playwright tests.   |
| `chrome-devtools-mcp` | Drive and inspect a real browser through Chrome DevTools. |

### Bug diagnosis

| Command           | Description                                                          |
|-------------------|----------------------------------------------------------------------|
| `diagnosing-bugs` | Structured diagnosis loop for hard bugs and performance regressions. |
| `astral:ty`       | Catch type errors before they reach runtime.                         |

### Evidence and iteration

| Command                                      | Description                                                                        |
|----------------------------------------------|------------------------------------------------------------------------------------|
| `iterative-development:auditing-progress`    | Verify behavior-evidence quality across current, impacted, and sentinel scenarios. |
| `iterative-development:running-an-iteration` | Run an iteration: baseline, implement, then impacted and sentinel scenario checks. |

## Phase 6: build, release and CI/CD

### Commits and pull requests

| Command                         | Description                                                           |
|---------------------------------|-----------------------------------------------------------------------|
| `/git:commit`                   | Create a git commit (stage all, single commit).                       |
| `/git:multiple`                 | Split changes into a logical sequence of commits.                     |
| `/git:push`                     | Commit and push.                                                      |
| `/git:pr`                       | Commit, push, and open a pull request.                                |
| `/issues:github-coding-process` | Plan, implement, test, and ship a GitHub issue end to end using `gh`. |

### Branch and history hygiene

| Command             | Description                                                            |
|---------------------|------------------------------------------------------------------------|
| `/git:branches`     | Delete stale local branches whose remote tracking branch is gone.      |
| `/git:worktrees`    | Remove worktrees whose branch is gone on the remote, then delete them. |
| `/git:amend-author` | Rewrite the author of the whole branch or the last N commits.          |
| `/git:amend-date`   | Set an absolute commit and author date on the most recent commit.      |
| `/git:shift-dates`  | Shift the last N commit dates by a number of hours.                    |

### Merge and platform

| Command                     | Description                                                               |
|-----------------------------|---------------------------------------------------------------------------|
| `resolving-merge-conflicts` | Work through an in-progress git merge or rebase conflict.                 |
| `gh-cli`                    | Comprehensive `gh` reference for repos, PRs, Actions, releases, and more. |
| `glab`                      | GitLab CLI operations.                                                    |

### Release plumbing

| Command           | Description                                                                 |
|-------------------|-----------------------------------------------------------------------------|
| `/git:changelog`  | Generate a changelog for a time period (day, week, month, year, or N days). |
| `terraform-skill` | Terraform CI, scans, and state operations in the pipeline.                  |

## Phase 7: deploy and operate

### Scheduling and recurring jobs

| Command    | Description                                                                |
|------------|----------------------------------------------------------------------------|
| `schedule` | Create and manage scheduled cloud agents (routines) on a cron schedule.    |
| `loop`     | Run a prompt or slash command on a recurring interval, or poll for status. |

### Infrastructure and data ops

| Command                  | Description                                                           |
|--------------------------|-----------------------------------------------------------------------|
| `terraform-skill`        | Apply and manage infrastructure state.                                |
| `neon-postgres-branches` | Spin up isolated database branches for staging and test environments. |
| `cloudflare`             | Deploy and operate Cloudflare edge resources.                         |

### Harness config

| Command         | Description                                                                    |
|-----------------|--------------------------------------------------------------------------------|
| `update-config` | Configure the Claude Code harness: permissions, env vars, and automated hooks. |

## Phase 8: maintain and document

### Refactor and modernize

| Command                         | Description                                                                                                |
|---------------------------------|------------------------------------------------------------------------------------------------------------|
| `legacy-modernizer`             | Subagent that refactors legacy code, migrates frameworks, and pays down technical debt (code-refactoring). |
| `code-simplifier`               | Subagent that simplifies code for clarity and maintainability while preserving behavior.                   |
| `improve-codebase-architecture` | Reshape an existing codebase toward a cleaner architecture.                                                |
| `diagnosing-bugs`               | Diagnose regressions and hard bugs in maintained code.                                                     |
| `simplify`                      | Trim reuse, complexity, and dead flexibility from existing code.                                           |

### Documentation

| Command                   | Description                                                           |
|---------------------------|-----------------------------------------------------------------------|
| `/simple:markitdown`      | Convert files (PDF, Office, images, audio, HTML) to Markdown.         |
| `/simple:proofread`       | Proofread text for spelling, grammar, and readability.                |
| `meeting-summarizer`      | Turn a meeting or interview transcript into structured English notes. |
| `/summarize:transscripts` | Summarize a meeting or transcript into sections with action items.    |
| `teach`                   | Explain a concept or codebase area for onboarding.                    |
| `handoff`                 | Capture session state so work can be picked up later.                 |
| `writing-great-skills`    | Author well-structured skills for this environment.                   |
| `init`                    | Document the codebase into a `CLAUDE.md`.                             |

## Cross-cutting (every phase)

These apply regardless of which phase you are in.

| Command                    | Description                                                                            |
|----------------------------|----------------------------------------------------------------------------------------|
| `caveman`                  | Ultra-compressed communication mode to cut token usage while keeping substance.        |
| `ponytail`                 | Force the simplest solution that works: stdlib and native features before custom code. |
| `context7:docs`            | Fetch current documentation for any library, framework, or SDK.                        |
| `install-mcp`              | Add a project-scoped MCP server to the repo.                                           |
| `update-config`            | Change harness settings, permissions, and hooks.                                       |
| `keybindings-help`         | Customize keyboard shortcuts and chord bindings.                                       |
| `fewer-permission-prompts` | Build an allowlist from transcripts to cut repeat permission prompts.                  |
| `claude-api`               | Reference for the Claude API and Anthropic SDK (models, pricing, tool use).            |
| `dataviz`                  | Design guidance for any chart, dashboard, or data visualization.                       |
| `watch:watch`              | Watch a video (tutorial, demo) and answer questions about its content.                 |
| `notion-workspace-plugin`  | Read and write a Notion workspace as a knowledge base.                                 |
