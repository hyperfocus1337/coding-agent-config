# Official alternatives to the format, lint, and type-check hooks

Can an official or maintained hook, plugin, or integration replace [`type-check-tsc`](../../../dot_claude/hooks/type-check-tsc/README.md), [`type-check-pyrefly`](../../../dot_claude/hooks/type-check-pyrefly/README.md), [`format-prettier`](../../../dot_claude/hooks/format-prettier/README.md), or [`lint-code`](../../../dot_claude/hooks/lint-code/README.md) in Claude Code, Codex, pi, and omp?

Read on 2026-10-19. "Local" means the installed copy in the devcontainer. Nothing was installed, enabled, or run as a live agent test.

| Source                                                                                                 | Version                                                    | What was read                                                                                                                                  |
| ------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Claude Code                                                                                            | 2.1.303 (local)                                            | `claude plugin list`, the binary strings, and the docs at code.claude.com                                                                      |
| [`anthropics/claude-plugins-official`](https://github.com/anthropics/claude-plugins-official)          | `main`, local clone updated 2026-10-19T16:56Z, 315 plugins | `.claude-plugin/marketplace.json`, `plugins/`, `external_plugins/`                                                                             |
| [`anthropics/claude-plugins-community`](https://github.com/anthropics/claude-plugins-community)        | `main`, 2,283 plugins                                      | `.claude-plugin/marketplace.json`                                                                                                              |
| [`astral-sh/claude-code-plugins`](https://github.com/astral-sh/claude-code-plugins)                    | plugin `astral` 0.1.0, last commit 2026-02-27              | Local clone                                                                                                                                    |
| [pyrefly](https://github.com/facebook/pyrefly)                                                         | 1.3.2 (local), 1.4.0 (latest, 2026-10-14)                  | Blog, docs, repo tree                                                                                                                          |
| [TypeScript](https://github.com/microsoft/TypeScript)                                                  | 7.0.2 (local and npm `latest`)                             | TS 7.0 announcement, npm registry, local `tsc --lsp --help`                                                                                    |
| [typescript-language-server](https://github.com/typescript-language-server/typescript-language-server) | 6.0.2 (local and latest)                                   | README, releases, issue #1110                                                                                                                  |
| [Prettier](https://github.com/prettier/prettier)                                                       | 3.9.10 (local)                                             | `prettier --support-info`, docs, 3.9 release blog                                                                                              |
| ruff, oxlint, shellcheck, yamllint, ansible-lint, terraform                                            | See [Linters](#linters)                                    | Repos, docs sites, changelogs                                                                                                                  |
| Codex CLI                                                                                              | 0.163.0 (local)                                            | The binary, [plugins docs](https://developers.openai.com/codex/plugins.md), [`openai/plugins`](https://github.com/openai/plugins) at `0722921` |
| pi                                                                                                     | 1.3.0 (local)                                              | `@earendil-works/pi-coding-agent` `docs/`, `examples/`, `CHANGELOG.md`, `dist/`                                                                |
| omp                                                                                                    | 18.12.2 (local)                                            | The binary strings, checked against [`can1357/oh-my-pi@v18.12.2`](https://github.com/can1357/oh-my-pi/tree/v18.12.2)                           |

For the hook events and mechanisms of each agent, see [hook platforms](../../hooks/platforms.md). This page does not repeat them.

## Claude Code

### Official marketplace

The official marketplace has no Prettier, pyrefly, ruff, oxlint, shellcheck, yamllint, or ansible-lint plugin, and no plugin that formats or lints after an edit. The relevant entries are:

| Plugin                                                                                                           | Maintainer | Content                                                                                                   |
| ---------------------------------------------------------------------------------------------------------------- | ---------- | --------------------------------------------------------------------------------------------------------- |
| [`pyright-lsp`](https://github.com/anthropics/claude-plugins-official/tree/main/plugins/pyright-lsp) 1.0.0       | Anthropic  | LSP server `pyright-langserver --stdio` for `.py` `.pyi`                                                  |
| [`typescript-lsp`](https://github.com/anthropics/claude-plugins-official/tree/main/plugins/typescript-lsp) 1.0.0 | Anthropic  | LSP server `typescript-language-server --stdio` for `.ts` `.tsx` `.js` `.jsx` `.mts` `.cts` `.mjs` `.cjs` |
| 11 other `*-lsp` plugins                                                                                         | Anthropic  | C, C#, Go, Java, Kotlin, Lua, PHP, Ruby, Rust, Swift. Liquid is from Shopify                              |
| [`terraform`](https://github.com/anthropics/claude-plugins-official/tree/main/external_plugins/terraform)        | HashiCorp  | MCP server `hashicorp/terraform-mcp-server:0.4.0` in Docker. Registry and HCP tools, no local fmt or lint |

Both LSP plugins are already on in [`settings.json.tmpl`](../../../dot_claude/settings.json.tmpl) (`enabledPlugins`, and `ENABLE_LSP_TOOL=1`). The [community marketplace](https://github.com/anthropics/claude-plugins-community) has third-party LSP plugins, such as `ty-python-lsp` and `terraform-lsp`, but no pyrefly, Prettier, ruff, or oxlint plugin.

### What an LSP plugin does

An LSP plugin names a server command and the extensions it handles. Claude Code then gives the model two things ([code intelligence](https://code.claude.com/docs/en/plugins/code-intelligence), [LSP tool behavior](https://code.claude.com/docs/en/tools-reference#lsp-tool-behavior)):

- **Diagnostics after edits, with no tool call.** "Each time Claude edits or writes a file the server handles, Claude gets the errors and warnings the server reports." The `diagnostics` field of an `lspServers` entry turns this off. Its default is `true` ([manifest reference](https://code.claude.com/docs/en/plugins/manifest-reference#lspservers)).
- **An `LSP` tool** for definitions, references, symbols, and call hierarchy. The tool is read-only.

The 2.1.303 binary shows how the diagnostics arrive. A `textDocument/publishDiagnostics` handler registers the server's diagnostics, and Claude Code attaches them to the context in a `<new-diagnostics>The following new diagnostic issues were detected:` block. It removes diagnostics that it already delivered, sorts by severity, and keeps at most 10 per file and 30 in total (`Cde=10`, `kRt=30`). The user sees only `Found N new diagnostic issues in M files`.

The diagnostics do not block. Nothing in the docs or the binary stops the turn or marks the tool result as an error. The model can stop with errors still open. Other limits:

- The docs name edits and writes. A file that a Bash command writes is not named, and I did not find code that sends it to the server.
- Diagnostics cover one file at a time, as the server reports them. They are not a whole-project check like `tsc --noEmit`.
- Cloud sessions do not start plugin language servers.
- The server must be on `PATH`. The plugin does not install it.

### `typescript-lsp` and TypeScript 7

`typescript-language-server` wraps `tsserver.js` from the `typescript` package. TypeScript 7 does not ship `tsserver.js` ([issue #1110](https://github.com/typescript-language-server/typescript-language-server/issues/1110)). Its README says the server installs with `typescript@6` and that TS 7 "will hopefully supersede this project".

In this devcontainer, the global `typescript` is 7.0.2, and its `lib/` holds only `tsc.js`, `getExePath.js`, and `version.cjs`. So the enabled `typescript-lsp` plugin finds no `tsserver.js` here unless a project has its own `typescript@6`. I did not run the server to confirm the failure.

TypeScript 7 has its own server: `tsc --lsp --stdio` (local 7.0.2 prints the `-stdio`, `-pipe`, and `-socket` flags). No official Claude Code plugin uses it. A local `.lsp.json` with `"command": "tsc", "args": ["--lsp", "--stdio"]` is possible, but no primary source documents that combination, and I did not test it.

### Astral plugin

[`astral@astral-sh`](https://github.com/astral-sh/claude-code-plugins) 0.1.0 is from Astral. It has skills for ruff, ty, and uv, and an LSP server `uvx ty@latest server` for `.py` `.pyi`. It has no hook. The ruff skill is guidance only, and the README says "Claude sometimes needs to be prompted to use skills". It is installed here but off (`"astral@astral-sh": false`).

### Docs examples

The [hooks guide](https://code.claude.com/docs/en/hooks-guide) shows a `PostToolUse` hook on `Edit|Write` that runs `jq -r '.tool_input.file_path' | xargs npx prettier --write`. This is an example to copy, not a maintained plugin. The guide also says that a `FileChanged` hook reformats a file "however it changes, including when a `Bash` command rewrites it". `FileChanged` exists only in Claude Code.

## pyrefly

The [agentic loop post](https://pyrefly.org/blog/pyrefly-agentic-loop) (Kyle Into, 2026-04-13) recommends a Claude Code `Stop` hook with `"command": "pyrefly check >&2 || exit 2"` and `"timeout": 30`, "so it runs when the agent completes each task". It also shows an agent-type Stop hook and a skill, and says a skill alone is not reliable. It does not mention `PostToolUse`, LSP, MCP, or plugins. Codex appears only as a link to its docs.

[`type-check-pyrefly`](../../../dot_claude/hooks/type-check-pyrefly/core.ts) already follows this post and names it in a comment. The post gives a snippet to copy. pyrefly ships no hook, plugin, MCP server, or Codex integration: the `facebook/pyrefly` tree has skills for its own developers and a [`/.well-known/agent-skills/index.json`](https://github.com/facebook/pyrefly/blob/main/website/static/.well-known/agent-skills/index.json) that points to `llms.txt`. The demo repo [`kinto0/pyrefly_hooks_demo`](https://github.com/kinto0/pyrefly_hooks_demo) is the author's personal repo, not a `facebook` repo.

pyrefly has an LSP server: `pyrefly lsp` (local 1.3.2, and the [IDE docs](https://github.com/facebook/pyrefly/blob/main/website/docs/IDE.mdx)). No marketplace that I read has a pyrefly LSP plugin. A local `.lsp.json` with `pyrefly lsp` would work in the same way as `pyright-lsp`, but I did not test it. pyrefly 1.4.0 (2026-10-14) changes some behavior, for example it now checks uv workspace members, so it can show new errors after an upgrade.

## TypeScript

The TypeScript team publishes no agent hook, plugin, or MCP server. The `.github/agents` and `.github/skills` folders in [microsoft/TypeScript](https://github.com/microsoft/TypeScript) are for compiler developers. [TypeScript 7.0](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/) was announced on 2026-07-08, and 7.0.2 is the first stable 7.0 on npm.

From 7.0 the native binary is `tsc`. The name `tsgo` was used only in `@typescript/native-preview`. [microsoft/typescript-go](https://github.com/microsoft/typescript-go) is archived, and the code now lives in microsoft/TypeScript. TS 7.0 has no API, so Vue, MDX, Astro, Svelte, and Angular template tools do not work with it yet. `@typescript/typescript6` gives a `tsc6` binary for them.

## Prettier

Prettier publishes no agent hook, Claude Code plugin, MCP server, or agent docs page. The [prettier org](https://github.com/prettier), the [docs](https://github.com/prettier/prettier/tree/main/docs), and the [3.9 release post](https://prettier.io/blog/2026/06/27/3.9.0) have none. `precommit.md` covers git hooks only.

`prettier --support-info` on 3.9.10 lists these native languages. The hook's list in [`core.ts`](../../../dot_claude/hooks/format-prettier/core.ts) covers only part of them:

| Native in Prettier 3.9.10                            | In the hook's list |
| ---------------------------------------------------- | ------------------ |
| JavaScript `.js` `.cjs` `.mjs`, JSX `.jsx`           | Yes                |
| TypeScript `.ts` `.tsx` `.mts` `.cts`                | Yes                |
| JSON `.json`                                         | Yes                |
| JSON with Comments `.jsonc`, JSON5 `.json5`          | No                 |
| CSS `.css`, SCSS `.scss`                             | Yes                |
| Less `.less`, PostCSS `.pcss` `.postcss`             | No                 |
| HTML `.html`                                         | Yes                |
| HTML `.htm` `.xhtml`, Vue `.vue`, Angular, MJML, LWC | No                 |
| Markdown `.md` `.markdown`                           | Yes                |
| MDX `.mdx` (MDX v1 only)                             | No                 |
| YAML `.yml` `.yaml`                                  | Yes                |
| GraphQL `.graphql` `.gql`, Handlebars `.hbs`         | No                 |

Prettier cannot format Python, shell, Go, Rust, Terraform, or TOML without a plugin ([plugins page](https://prettier.io/docs/plugins)). The plugins for shell, Rust, and TOML are community plugins. The prettier org's own Python plugin is archived. So the old name `format-all-languages` was not accurate: the hook formats the Prettier languages in one list. The hook is now `format-prettier`, and it also formats `.mts` and `.cts`, which `type-check-tsc` and `lint-code` both handle.

## Linters

| Tool                                                    | Local, latest                 | Official agent integration                                                                                                                                                                       | Language server                                                                              |
| ------------------------------------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| [ruff](https://github.com/astral-sh/ruff)               | 0.17.0, 0.17.1 (2026-10-15)   | Astral plugin (skill only, see above)                                                                                                                                                            | `ruff server` ([editors](https://github.com/astral-sh/ruff/blob/main/docs/editors/index.md)) |
| [oxlint](https://github.com/oxc-project/oxc)            | 1.87.0, 1.88.0 (2026-10-13)   | [Coding agents page](https://oxc.rs/docs/guide/usage/coding-agents.html): a Claude Code `PostToolUse` `Edit\|Write` hook that runs `oxlint --fix` then `oxfmt`. For Codex, `AGENTS.md` text only | `oxlint --lsp`                                                                               |
| [shellcheck](https://github.com/koalaman/shellcheck)    | 0.10.0, 0.11.0 (2025-08-03)   | None. `.claude/CLAUDE.md` in the repo is for its developers                                                                                                                                      | None official. Community `bash-language-server start` runs shellcheck                        |
| [yamllint](https://github.com/adrienverge/yamllint)     | 1.37.1, 1.38.0 (2026-01-13)   | None ([integrations](https://yamllint.readthedocs.io/en/stable/integration.html))                                                                                                                | None                                                                                         |
| [ansible-lint](https://github.com/ansible/ansible-lint) | 26.10.0, 26.10.1 (2026-10-13) | [Ansible MCP server](https://docs.ansible.com/projects/vscode-ansible/mcp/) (Red Hat, technical preview): tool `ansible_lint`, which runs only when the model calls it                           | `@ansible/ansible-language-server`                                                           |
| [terraform](https://github.com/hashicorp/terraform)     | 1.16.5, 1.16.6 (2026-10-14)   | [`hashicorp/agent-skills`](https://github.com/hashicorp/agent-skills): skills for Claude Code and Codex that tell the agent to run `terraform fmt`, `validate`, and tflint. No hook              | `terraform-ls serve`                                                                         |

Notes:

- **oxlint** comes closest to a vendor hook. Its hook fixes and formats, but it exits 0, so in Claude Code the errors that remain do not reach the model ([hooks reference](https://code.claude.com/docs/en/hooks): `PostToolUse` stderr reaches the model only on exit 2). This is a reading of the docs, not a test. oxlint 1.63.0 added `--format=agent`, and from 1.66.0 it picks that format when an agent runs it ([changelog](https://github.com/oxc-project/oxc/blob/main/apps/oxlint/CHANGELOG.md)).
- No vendor in this table names pi or omp.

## Codex CLI

Codex 0.163.0 has no LSP client (no `textDocument` or `publishDiagnostics` strings in the binary) and no formatter for agent edits. Its Prettier strings belong to `codex app-server generate-ts --prettier`. A Codex [plugin](https://developers.openai.com/codex/plugins.md) can hold skills, MCP servers, and hooks, but not LSP servers. The curated [`openai/plugins`](https://github.com/openai/plugins) marketplace (62 plugins at `0722921`, 2026-10-08) has no lint, format, LSP, or type-check plugin. The community [`code-yeongyu/codex-lsp`](https://github.com/code-yeongyu/codex-lsp) adds a `PostToolUse` hook and an LSP MCP server; I did not check its servers or how widely it is used.

## pi

pi 1.3.0 has no LSP client, formatter, or linter, and its about 70 `examples/extensions/` do none of these jobs. The maintainers publish no package for them. Community packages on [pi.dev/packages](https://pi.dev/packages) cover the same ground as the hooks here. I read their READMEs only:

| Package                                                              | Version | Trigger                                               | Blocks                                                                                                             |
| -------------------------------------------------------------------- | ------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| [pi-lens](https://github.com/apmantza/pi-lens)                       | 4.4.4   | `tool_result` after write and edit, a turn-end report | Optional commit guard. Runs ruff, oxlint, prettier, shellcheck, yamllint, tflint, `terraform fmt`, and LSP servers |
| [pi-edit-hooks](https://github.com/mackenney/pi-edit-hooks)          | 0.2.3   | After write and edit, and at stop                     | Errors at stop start a new turn. Runs any command                                                                  |
| [@patimweb/pi-sentinel](https://github.com/Smotherer007/pi-sentinel) | 3.0.0   | On edit, and a gate at `agent_end`                    | Yes, with a limit on repair attempts                                                                               |
| [@balaenis/pi-format](https://github.com/balaenis/pi-toolset)        | 0.2.1   | After write and edit                                  | No. Biome, oxfmt, Prettier, ruff, gofmt, shfmt                                                                     |

I did not check whether these packages load in omp.

## omp

omp 18.12.2 has a built-in LSP client and an optional format step ([lsp-config.md](https://github.com/can1357/oh-my-pi/blob/v18.12.2/docs/lsp-config.md), [settings.md](https://github.com/can1357/oh-my-pi/blob/v18.12.2/docs/settings.md)). The defaults below are confirmed in the binary:

| Setting                  | Default | Effect                                                                    |
| ------------------------ | ------- | ------------------------------------------------------------------------- |
| `lsp.enabled`            | `true`  | Starts servers for files with a root marker, when the binary is installed |
| `lsp.diagnosticsOnWrite` | `true`  | Appends `LSP Diagnostics` to the `write` result                           |
| `lsp.diagnosticsOnEdit`  | `false` | The same for the `edit` tool                                              |
| `lsp.formatOnWrite`      | `false` | Formats through the LSP server after `write` and `edit`                   |

The default server list includes pyright, basedpyright, ty, ruff, `typescript-language-server`, `typescript-native` (`tsc --lsp`), biome, eslint, yaml-language-server, terraform-ls, and bash-language-server. It does not include pyrefly, oxlint, ansible-language-server, or Prettier, but `~/.omp/agent/lsp.json` can add a server. omp also reads the `lspServers` of Claude plugins. The diagnostics only report: a write with errors still succeeds. The `/cleanse` command runs the project's checkers and sends subagents to fix the findings, but you start it by hand.

## Candidates

| Candidate                               | Maintainer          | Agents                     | Trigger                           | Blocks      | It lacks                                                                                            | It adds                                        |
| --------------------------------------- | ------------------- | -------------------------- | --------------------------------- | ----------- | --------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| `pyright-lsp`, `typescript-lsp`         | Anthropic           | Claude Code                | Edit and Write, server push       | No          | Bash writes, whole-project check, a block at the stop, pyrefly. `typescript-lsp` needs TS 6         | Errors after each edit, symbol navigation      |
| `astral` (ty LSP, skills)               | Astral              | Claude Code                | Edit and Write; skills on request | No          | ruff check, a block, Bash writes                                                                    | ty diagnostics                                 |
| pyrefly Stop hook snippet               | pyrefly (blog)      | Claude Code                | `Stop`                            | Yes, exit 2 | git scoping, loop guard, Codex, pi, omp                                                             | None that the hook here lacks                  |
| Claude Code docs Prettier hook          | Anthropic (example) | Claude Code                | `PostToolUse` `Edit\|Write`       | No          | Bash sweep, amend hint, `--prose-wrap preserve`, ignore rules, extension filter                     | None                                           |
| oxc coding-agents hook                  | Oxc                 | Claude Code; Codex as text | `PostToolUse` `Edit\|Write`       | No          | Error report to the model, other languages, Bash writes                                             | `--fix` and oxfmt                              |
| Ansible MCP `ansible_lint`              | Red Hat (preview)   | Claude Code and others     | Model calls the tool              | No          | Automatic run after an edit                                                                         | Structured findings, `fix`                     |
| `hashicorp/agent-skills`, terraform MCP | HashiCorp           | Claude Code, Codex         | Skill, or model calls a tool      | No          | Automatic run, local fmt or lint in the MCP server                                                  | Registry and style guidance                    |
| omp built-in LSP                        | omp                 | omp                        | `write` (and `edit` if set)       | No          | pyrefly, oxlint, shellcheck, yamllint, ansible-lint, `terraform fmt`, Prettier, a block at the stop | Diagnostics in the tool result, LSP formatting |
| pi community packages                   | Community           | pi                         | `tool_result`, stop               | Some        | Not read from source                                                                                | Several tools in one package                   |

## Consequences for the hooks here

**`type-check-tsc` and `type-check-pyrefly`: no candidate replaces them.** The only vendor material is the pyrefly blog snippet, which `type-check-pyrefly` already follows and extends with git scoping and a loop guard for four agents. The TypeScript team publishes nothing like it. The LSP plugins give per-file errors after each edit, but they do not run a whole-project check, do not see Bash writes, and do not block the stop. They complement the hooks. Gaps that remain:

- `typescript-lsp` has no `tsserver.js` to use with the global TypeScript 7.0.2 here. A local plugin with `tsc --lsp --stdio`, or a project-level `typescript@6`, would close this. Neither is tested.
- No plugin wires `pyrefly lsp`, so the per-edit Python errors come from pyright, a different checker with different results from the stop check.
- Codex and pi have no LSP. omp has LSP diagnostics after `write` by default, but they do not block. So the two hooks stay the only blocking type check in all four agents.

**`format-prettier`: no candidate replaces it.** Prettier ships no agent integration, and the Claude Code docs example covers only the Write and Edit path without the Bash sweep, the amend hint, or the ignore rules. omp's `lsp.formatOnWrite` (off by default) formats through language servers, not Prettier, and Codex and pi have nothing built in.

The old name `format-all-languages` was not accurate, because the hook runs Prettier on a fixed list of extensions and does no other language. The hook is now `format-prettier`, and its list now has `.mts` and `.cts`, which Prettier formats natively.

**`lint-code`: no candidate replaces it, and only a part could move.** No vendor ships a hook that reports lint errors to the model after an edit. In Claude Code, local `.lsp.json` servers (`ruff server`, `oxlint --lsp`, `bash-language-server start`) would deliver per-file diagnostics after Edit and Write, without a block and without Bash writes. In omp, the built-in ruff, eslint, biome, bash, and terraform-ls servers do the same after `write`. Codex and pi would still need the hook, and no server covers yamllint or ansible-lint in all four agents.

The old name `lint-all-languages` was not accurate either, because the hook lints Python, JS/TS, shell, and YAML. The hook is now `lint-code`, which pairs with `lint-prose`. The `tf` entry checked format, not lint. It is now the [`format-code`](../../../dot_claude/hooks/format-code/README.md) hook, which runs `terraform fmt` without `-check`, and `lint-code` did not check Terraform. Since 2026-10-21, `lint-code` runs tflint on `.tf` files.

## Not verified

- That `typescript-lsp` fails here. The missing `tsserver.js` is confirmed, but I did not start the server.
- That a Claude Code `.lsp.json` with `tsc --lsp --stdio` or `pyrefly lsp` works. No primary source documents it, and I did not test it.
- That Claude Code sends diagnostics for a file that a Bash command wrote. The docs name only edits and writes, and I did not trace the code that opens files on the server.
- That the oxc hook's remaining errors never reach Claude. This comes from the hooks reference, not a test.
- That omp never marks a write as failed because of diagnostics. The source read found no such path, but not every path was traced.
- The behavior of the pi community packages and `codex-lsp`, and whether pi packages load in omp. Only READMEs were read.
- Widely used community hook projects for these linters. The GitHub search API limit stopped the search, and web search found only small repos.
