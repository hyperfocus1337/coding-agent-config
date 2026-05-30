# Claude Plugins and MCP Servers Installation Scripts

Utility script for installing and managing Claude plugins and Model Context Protocol (MCP) servers across different environments.

---

## Layout

- `install.sh` — entry point. Runs the env preamble (PATH check, `~/.claude` symlink sync, container-only git URL rewrites) and then invokes `plugins/install.sh`, `mcp/install.sh`, and `skills/install.sh` in order.
- `plugins/install.sh` — Claude plugin and marketplace installs via `claude plugin ...` (each marketplace add paired with its installs).
- `mcp/install.sh` — user-scoped MCP server installs via `claude mcp add ...`. Mirrored by `mcp/remove.sh`.
- `mcp/remove.sh` — tears down the MCP servers added by `mcp/install.sh`. Keep the two lists in sync.
- `skills/install.sh` — third-party skills installed outside the Claude plugin marketplace (e.g. `npx skills@latest add ...`).

Run `./install.sh` to install everything. The child scripts can be run individually but assume the preamble has already executed.

---

## Plugins

### Official Anthropic Plugins (`anthropics/claude-plugins-official`)

Source: [github.com/anthropics/claude-code](https://github.com/anthropics/claude-code/tree/main/plugins/)

#### `code-review`

Adds structured code review capabilities. Use when you want Claude to perform thorough, opinionated reviews of diffs or entire files — checking for bugs, security issues, style violations, and adherence to best practices. Ideal for pre-merge review workflows or reviewing a PR before submitting.

#### `commit-commands`

Provides slash commands for generating and managing git commits. Use when you want Claude to automatically draft commit messages from staged changes, follow conventional commit formats, and streamline the commit workflow without leaving the terminal.

#### `feature-dev`

Adds a guided feature development workflow. Use when starting work on a new feature — it helps Claude break down requirements, plan implementation steps, scaffold code, and track progress through a structured development loop.

#### `code-simplifier`

Adds workflows for simplifying and refining existing code without changing behavior. Use when you want Claude to focus on clarity, consistency, and maintainability — removing dead code, flattening control flow, and tightening naming — typically against recently modified code.

#### `superpowers`

Source: [github.com/obra/superpowers](https://github.com/obra/superpowers)

Bundles a collection of opinionated skills and workflows that extend Claude's default capabilities. Use as a general-purpose productivity layer on top of the base Claude Code experience.

---

### Pyright LSP (`piebald-ai/claude-code-lsps`)

Source: [github.com/Piebald-AI/claude-code-lsps](https://github.com/Piebald-AI/claude-code-lsps/tree/main/pyright)

#### `pyright`

Integrates Pyright as a Language Server Protocol (LSP) provider, giving Claude real-time type-checking diagnostics for Python projects. Use when working in Python codebases where type safety matters — Claude will surface type errors, undefined references, and incorrect signatures as it reads and edits code, rather than relying solely on its own inference.

> **Note:** The official `pyright-lsp@claude-plugins-official` plugin is pending release. This marketplace serves as a replacement in the interim.

---

### Context7 (`upstash/context7`)

Source: [github.com/upstash/context7](https://github.com/upstash/context7/tree/master/plugins/claude/context7)

#### `context7-plugin`

Gives Claude access to up-to-date, version-specific library documentation fetched at query time. Use whenever you need accurate code generation, configuration, or setup steps for any third-party library or framework. Prevents Claude from relying on potentially outdated training data by resolving the library's current docs on demand.

---

### Code Refactoring (`wshobson/agents`)

Source: [github.com/wshobson/agents](https://github.com/wshobson/agents/tree/main/plugins/code-refactoring)

#### `code-refactoring`

Adds opinionated refactoring workflows and commands. Use when improving the internal structure of existing code without changing its external behavior — extracting functions, simplifying logic, reducing duplication, or modernizing patterns. Best suited for targeted cleanup sessions rather than large-scale rewrites.

---

### AST-Grep (`ast-grep/agent-skill`)

Source: [github.com/ast-grep/agent-skill](https://github.com/ast-grep/agent-skill/tree/main/ast-grep)

#### `ast-grep`

Enables structural code search and transformation using Abstract Syntax Tree (AST) patterns rather than plain text matching. Use when you need to find or refactor code by its syntactic structure — e.g., all function calls with a specific signature, all class definitions missing a decorator, or complex multi-line patterns that regex cannot reliably match.

---

### Astral (`astral-sh/claude-code-plugins`)

Source: [github.com/astral-sh/claude-code-plugins](https://github.com/astral-sh/claude-code-plugins/tree/main/plugins/astral)

#### `astral`

Bundles skills for Astral's Python toolchain: **uv** (package and project manager), **ruff** (linter and formatter), and **ty** (type checker). Use when working in Python projects managed with `uv` — Claude will use `ruff` for linting/formatting fixes and `ty` for type-checking rather than slower or less accurate alternatives.

---

### Codex (`openai/codex-plugin-cc`)

Source: [github.com/openai/codex-plugin-cc](https://github.com/openai/codex-plugin-cc/tree/main/codex-plugin-cc)

#### `codex`

Integrates OpenAI Codex as a second-opinion engine inside Claude Code. Use when you want a parallel implementation or diagnosis pass, deeper root-cause investigation, or to hand off a substantial coding task to Codex through the shared runtime.

---

### Caveman (`JuliusBrussee/caveman`)

Source: [github.com/JuliusBrussee/caveman](https://github.com/JuliusBrussee/caveman)

#### `caveman`

Ultra-compressed communication mode that cuts token usage by speaking tersely while keeping full technical accuracy. Use when you want shorter responses, reviews, or commit messages without losing actionable signal.

---

### Notion (`makenotion/claude-code-notion-plugin`)

Source: [github.com/makenotion/claude-code-notion-plugin](https://github.com/makenotion/claude-code-notion-plugin)

#### `notion-workspace-plugin`

Connects Claude to a Notion workspace for searching pages and databases, creating pages and tasks, and querying database rows. Use when work involves Notion-managed docs, tasks, or knowledge bases.

---

### Claude Video (`bradautomates/claude-video`)

Source: [github.com/bradautomates/claude-video](https://github.com/bradautomates/claude-video)

#### `watch`

Lets Claude watch a video from a URL or local path. Downloads with `yt-dlp`, extracts frames with `ffmpeg`, transcribes from native captions or Whisper fallback, then answers questions about the content. Add `GROQ_API_KEY` (preferred) or `OPENAI_API_KEY` to `~/.config/watch/.env` to enable the Whisper fallback.

---

### Matt Pocock Skills (`mattpocock/skills`)

Source: [github.com/mattpocock/skills](https://github.com/mattpocock/skills)

Installed via `npx skills@latest add` in `skills/install.sh` rather than the Claude plugin marketplace. Bundles Matt Pocock's opinionated skill set for Claude Code, Cursor, and OpenCode:

- `grill-me`, `grill-with-docs` — interrogate code and concepts against fresh docs.
- `handoff` — structured session/context handoff between agents.
- `improve-codebase-architecture` — review and refactor codebase structure.
- `setup-matt-pocock-skills` — bootstrap the rest of the skill set.
- `tdd` — guided test-driven development loop.
- `triage` — incoming-issue triage workflow.
- `to-issues`, `to-prd` — convert raw notes/specs into GitHub issues or a PRD.

---

### Playwright Skills (`microsoft/playwright-cli`)

Source: [github.com/microsoft/playwright-cli](https://github.com/microsoft/playwright-cli)

Installed conditionally when `playwright-cli` is on `PATH`, via `playwright-cli install --skills`. Adds browser automation skills (navigation, interaction, assertions) for end-to-end testing and UI verification workflows.

---

## MCP Servers (User-Scoped)

MCP servers are registered globally at user scope and available across all Claude sessions.

### `tessl`

Docs: [docs.tessl.io](https://docs.tessl.io/reference/custom-agent-setup)

Connects Claude to the Tessl platform for AI-assisted software engineering workflows. Use when working within a Tessl-managed environment to enable agent capabilities, custom workflow integrations, and project-level context provided by the Tessl infrastructure.

---

### `context7`

Docs: [github.com/upstash/context7](https://github.com/upstash/context7?tab=readme-ov-file#installation)

MCP server counterpart to the Context7 plugin. Provides Claude with on-demand access to current library documentation for any framework or package. Use for code generation, API lookups, and setup instructions where accurate, version-specific documentation is critical.

---

### `jcodemunch`

Docs: [github.com/jgravelle/jcodemunch-mcp](https://github.com/jgravelle/jcodemunch-mcp?tab=readme-ov-file#configure-mcp-client)

An MCP server that enables deep code analysis and understanding across a codebase. Use when you need Claude to ingest, index, and reason over large amounts of source code — particularly useful for onboarding to unfamiliar repositories or performing cross-file analysis.

---

### `jdocmunch`

Docs: [github.com/jgravelle/jdocmunch-mcp](https://github.com/jgravelle/jdocmunch-mcp?tab=readme-ov-file#configure-an-mcp-client)

An MCP server focused on ingesting and querying documentation. Use when you need Claude to reason over large volumes of markdown, HTML, or plain-text documentation — useful for answering questions about internal docs, runbooks, or any documentation that isn't indexed by Context7.

---

### `stitch`

Docs: [stitch.withgoogle.com/docs/mcp/setup](https://stitch.withgoogle.com/docs/mcp/setup)

Google Stitch MCP server (HTTP transport). Use for Stitch-powered workflows that depend on its hosted tooling. Requires a valid `X-Goog-Api-Key` header — replace the placeholder in `mcp/install.sh` with your real key before use.

---

### `directus`

Docs: [directus.io/docs/guides/ai/mcp](https://directus.io/docs/guides/ai/mcp)

Directus MCP server (HTTP transport) for interacting with a Directus instance — collections, fields, items, files, flows, and schema. Replace the placeholder URL and bearer token in `mcp/install.sh` with your Directus instance URL and a generated token before use.
