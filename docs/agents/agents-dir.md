# A shared `.agents` directory for Claude Code and pi

Whether one directory can hold the rules, hooks, commands, and skills that both Claude Code and [pi](https://pi.dev/) read, so this repo keeps one copy of each.

Measured 2026-09-17 with Claude Code 2.1.274, pi 0.85.1, and chezmoi 2.72.1. Both sides are now measured by execution. The pi probes ran with an isolated `HOME`, a fixture repo, and a stub model provider that served a canned tool call, so discovery, hooks, and rule injection were observed in real sessions without a provider account.

## The short answer

Yes. Claude Code resolves symlinks for skills, commands, and rules, at user scope and project scope, for a single symlink per directory. pi reads `.agents/skills/` natively and can be pointed at any other path through its settings. So `.agents/` holds the real content, Claude Code reaches it through three symlinks per scope, and pi reaches it through native discovery plus one settings key.

Two things do not follow this pattern. Instructions need `CLAUDE.md` to be a symlink to `AGENTS.md`, because Claude Code 2.1.274 still does not read `AGENTS.md`, while pi reads either name. Hooks and rules cannot be reached by a symlink, because pi has no shell hook and no rules concept, but one pi extension reproduces both: its lifecycle events map one for one onto Claude's hook events, and it runs the same scripts and injects the same rule text. That extension is now measured, not inferred.

One cost is larger than it looked. pi has no command namespace, so every file under `commands/` becomes `/<basename>` and three names in this repo collide.

## Where each tool looks

| Thing        | Claude Code                                                    | pi                                                                                                                                                             |
| ------------ | -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Instructions | `CLAUDE.md` (project, `~/.claude/`)                            | `AGENTS.md` or `CLAUDE.md`, walking up from cwd, plus `~/.pi/agent/AGENTS.md`; `AGENTS.override.md` wins                                                       |
| Skills       | `.claude/skills/<name>/SKILL.md`, `~/.claude/skills/`, plugins | `.agents/skills/` in cwd and ancestors up to the git root, `.pi/skills/` in cwd only, `~/.agents/skills/`, `~/.pi/agent/skills/`                               |
| Commands     | `.claude/commands/*.md`, `~/.claude/commands/`                 | prompt templates in `.pi/prompts/*.md` and `~/.pi/agent/prompts/*.md`, non-recursive; a directory named in the settings `prompts` array is scanned recursively |
| Rules        | `.claude/rules/*.md`, `~/.claude/rules/`, `paths:` frontmatter | no equivalent, folded into `AGENTS.md`                                                                                                                         |
| Hooks        | shell commands wired to events in `settings.json`              | TypeScript extensions in `.pi/extensions/` and `~/.pi/agent/extensions/`, subscribing to lifecycle events                                                      |
| Config       | `.claude/settings.json`, `~/.claude/settings.json`             | `.pi/settings.json`, `~/.pi/agent/settings.json`                                                                                                               |
| MCP          | native                                                         | no native support; an adapter extension reads `~/.agents/mcp.json` among other paths                                                                           |

Sources: the docs bundled with pi 0.85.1 (`docs/skills.md`, `docs/prompt-templates.md`, `docs/extensions.md`, `docs/settings.md`, `docs/usage.md` in the installed package), plus the probes below.

## The asymmetry that decides the design

pi is configurable and Claude Code is not, so the sharing cost falls on the Claude side.

pi settings take a `skills`, `prompts`, `extensions`, and `themes` array of paths. The arrays accept glob patterns, `!pattern` to exclude, `+path` to force-include, and `-path` to force-exclude. Paths resolve relative to `~/.pi/agent` in global settings and to `.pi` in project settings, and both accept absolute paths and `~`. So pi can be aimed at any directory without a symlink.

Claude Code has no equivalent. There is no `skillsPath` and no `additionalSkillsPaths`. The canonical request, [#18621](https://github.com/anthropics/claude-code/issues/18621), was closed `not planned`, and [#22902](https://github.com/anthropics/claude-code/issues/22902) was closed as a duplicate of it. Its discovery paths are fixed. The only lever is the filesystem, which is why the design uses symlinks.

## What was measured

Each probe put a unique token in a resource, started a headless session with `claude -p --model haiku`, and asked the session to report the token. A reported token proves discovery. Fixtures are in the session scratchpad, not in the repo.

### Project scope

| Probe                                                                                 | Result      |
| ------------------------------------------------------------------------------------- | ----------- |
| Skill through a per-skill symlink, `.claude/skills/<name>` → `.agents/skills/<name>`  | discovered  |
| Skill through a symlinked directory, `.claude/skills` → `.agents/skills`              | discovered  |
| Command through a per-file symlink, `.claude/commands/x.md` → `.agents/commands/x.md` | expanded    |
| Command through a symlinked directory, `.claude/commands` → `.agents/commands`        | expanded    |
| Rule through a per-file symlink, `.claude/rules/x.md` → `.agents/rules/x.md`          | loaded      |
| `AGENTS.md` alone in a project root                                                   | **ignored** |
| `AGENTS.md` with `CLAUDE.md` as a symlink to it                                       | loaded      |

### User scope

| Probe                                                                               | Result       |
| ----------------------------------------------------------------------------------- | ------------ |
| Skill through a symlinked directory, `~/.claude/skills` → `~/.agents/skills`        | discovered   |
| Command through a symlinked directory, `~/.claude/commands` → `~/.agents/commands`  | expanded     |
| Rule through a symlinked directory, `~/.claude/rules` → `~/.agents/rules`           | loaded       |
| chezmoi `symlink_skills` holding `../.agents/skills`, applied to a test destination | correct link |

User-scope probes ran with `CLAUDE_CONFIG_DIR` pointed at a throwaway config directory, so the real `~/.claude` was never modified.

Two details from the chezmoi probe. The symlink target is written relative to the link, not to the home directory, so the file must hold `../.agents/skills` and not `.agents/skills`. The first attempt used the second form, chezmoi created the link exactly as asked, and the link dangled.

### pi scope

Each pi probe ran `pi -p` against a fixture repo with a unique token in every resource. An extension dumped `systemPromptOptions` at `before_agent_start`, so the result is what pi loaded, not what the model reported. Tool-level probes used a stub OpenAI-compatible provider that returned a canned tool call.

| Probe                                                                      | Result                                  |
| -------------------------------------------------------------------------- | --------------------------------------- |
| Skill in `~/.agents/skills/<name>/SKILL.md`                                | discovered                              |
| Root `.md` file in `~/.agents/skills/`                                     | **ignored**                             |
| Nested `.md` file in `~/.agents/skills/<group>/`                           | discovered                              |
| Root `.md` file in `~/.pi/agent/skills/`                                   | discovered                              |
| Skill with `disable-model-invocation: true`                                | loaded, absent from system prompt       |
| Project skill in `.agents/skills/`, run from the repo root                 | discovered when trusted                 |
| Project skill in `.agents/skills/`, run from a subdirectory                | discovered when trusted                 |
| Project skill in `.pi/skills/`, run from a subdirectory                    | **not discovered**                      |
| Any project resource without `--approve`                                   | **skipped**, `isProjectTrusted()` false |
| Prompt template in `~/.pi/agent/prompts/sub/`                              | **not discovered**                      |
| Settings `prompts: ["~/.agents/commands"]`, file at the root               | registered as `/name`                   |
| Same setting, file at `git/commit/single.md`                               | registered as `/single`                 |
| Two files with the same basename in different subdirectories               | **one silently wins**                   |
| Prompt template description in the system prompt                           | **absent**                              |
| `$1`, `$@`, `${2:-FALLBACK}` in a template                                 | expanded                                |
| `AGENTS.md` in the repo root, no `CLAUDE.md`                               | loaded                                  |
| `CLAUDE.md` in the repo root, no `AGENTS.md`                               | loaded                                  |
| `AGENTS.override.md` next to both                                          | loaded, replaces both                   |
| `~/.pi/agent/AGENTS.md`                                                    | loaded, and in untrusted projects       |
| Project extension in `.pi/extensions/`, run from a subdirectory            | **not loaded**                          |
| Hook adapter: unmodified `enforce-cli-tools/hook.sh` against `npm install` | blocked the `bash` call                 |
| Same hook against an allowed command                                       | passed through, tool ran                |
| Rule with no `paths:`, injected at `before_agent_start`                    | in the system prompt of call 1          |
| Rule with `paths: ["**/*.py"]`, injected at `context` after a `read`       | in the messages of call 2               |

Three details the table compresses. Project trust is the gate for `.pi/` and for project `.agents/skills/`, but not for `AGENTS.md`: an untrusted project still contributes its instruction files. `.pi/` is read in the current directory only, while `.agents/skills/` walks up to the git root, so the two project paths do not behave alike. And `-p` never prompts for trust, so every non-interactive run needs `--approve` or `defaultProjectTrust: "always"` to see project resources.

### Correction to the Codex doc

[`codex-compat.md`](codex-compat.md) states that symlinking `.claude/skills` itself "gets skipped by the scanner" and that only per-skill symlinks resolve. That is no longer true in 2.1.274. Both forms work, at both scopes. The practical effect is large: the shim is three symlinks per scope instead of one per skill, and a new skill needs no new symlink. Fix that line before anyone follows it.

## What each resource type needs

**Skills.** Nothing beyond the symlink. pi reads `~/.agents/skills/` and project `.agents/skills/` natively, walking up to the git root. Its required frontmatter is `name` and `description`, and it also accepts `allowed-tools` and `disable-model-invocation`, so the SKILL.md files in this repo need no change. One pi rule differs: in `.agents/skills/`, root `.md` files are ignored and only directories with a `SKILL.md` count, which is already how every skill here is written.

**Commands.** pi calls them prompt templates, invokes them as `/name`, and supports `$ARGUMENTS`, `$1`, `$@`, `${1:-default}`, and slicing, so the argument conventions in `dot_claude/commands/` carry over. A prompt template never reaches the model: its description is not in the system prompt, so it cannot fire on its own, which is the behaviour a Claude command has.

One real gap: names flatten. Discovery inside a `prompts/` directory is non-recursive, but a directory named in the settings `prompts` array is scanned to any depth, and every file becomes `/<basename>`. There is no `:` namespace, so `git/commit/single.md` is `/single`, not `/git:commit:single`, and two files with the same basename collide, with one silently dropped. This repo has three such collisions today: `git/branches/cleanup.md` against `git/worktrees/cleanup.md`, `git/push.md` against `git/commit/push.md`, and `README.md` at three levels, which pi would also register as `/README`. Renaming for uniqueness, or one settings entry per leaf directory, is the price of sharing the command tree.

**Rules.** pi has no rules concept of its own, and no `paths:` scoping. A pi extension reproduces both, measured working: `before_agent_start` returns a replacement system prompt, and the `context` event appends messages before each LLM call. See [one extension covers hooks and rules](#one-extension-covers-hooks-and-rules).

**Hooks.** The scripts are shareable, the wiring is not. A Claude hook is a shell command wired to an event in `settings.json`, and the script already lives outside `.claude/` as far as Claude is concerned, because `settings.json` names an arbitrary path. pi has no shell hook, but its extension events line up with Claude's hook events one for one, so an adapter extension runs the same scripts. See the next section.

**Subagents and plugins.** Claude-only. `~/.claude/agents/` and the plugin system have no pi counterpart. Leave them in `.claude/`.

**MCP.** Claude Code is native. pi 0.85.1 has no built-in MCP, and its own docs list MCP, sub-agents, permission popups, plan mode, to-dos, and background bash as deliberate omissions that extensions must supply. Community adapters add it: [pi-code](pi-code.md) reads Claude's `.mcp.json` and settings scopes, and at least one other reads `~/.agents/mcp.json`. Both are unmeasured. Do not plan around either until it is tested.

## One extension covers hooks and rules

Measured by execution on 2026-09-17 against pi 0.85.1. A prototype adapter ran the repo's own `enforce-cli-tools/hook.sh`, unmodified, from the `hooks` block of a Claude `settings.json`, and blocked a `bash` call carrying `npm install`. A second extension injected both rule kinds. Fixture and adapter are in the session scratchpad, not in the repo.

An extension is a TypeScript module in `~/.pi/agent/extensions/` or `.pi/extensions/`, loaded through jiti with no build step. Node built-ins are available, including `node:child_process`, so an extension can spawn a shell script and write JSON to its stdin. That is the whole mechanism five of the six hooks in this repo need; the sixth, `type-check-all-languages`, runs on `Stop`, which the adapter does not bridge yet.

### Hooks: the events line up

| Claude hook    | pi event        | How the handler answers                                               |
| -------------- | --------------- | --------------------------------------------------------------------- |
| `PreToolUse`   | `tool_call`     | return `{ block: true, reason, terminate? }`, or mutate `event.input` |
| `PostToolUse`  | `tool_result`   | return `{ content, details, isError }` as a partial patch             |
| `SessionStart` | `session_start` | no return value needed                                                |

Two events the hooks use have no row, because the adapter does not wire them. `Stop` maps to pi's `agent_end`, which pi-code already drives, so adding it is a third `pi.on` call rather than a new mechanism; until then `type-check-all-languages` is Claude-only. `PostToolUseFailure` shares pi's `tool_result` with `PostToolUse` and is told apart by the result's error flag, so the two formatting hooks run under the adapter but miss a shell command that writes a file and then exits non-zero.

`tool_call` fires before the tool runs and `tool_result` fires after it finishes, which is exactly where Claude fires its two hooks. Both chain in extension load order, and each handler sees the previous handler's changes, so several hooks on one event behave as they do in Claude.

The payload translation is small, because the five tool hooks here read only four fields from Claude's JSON:

| Claude field           | pi source                                     |
| ---------------------- | --------------------------------------------- |
| `tool_input.command`   | `event.input.command` on the `bash` tool      |
| `tool_input.file_path` | `event.input.path` on `read`, `write`, `edit` |
| `cwd`                  | `ctx.cwd`                                     |
| `hook_event_name`      | the event the adapter is bridging             |

The `file_path` row is a rename, not a pass-through, and the adapter must do it: pi's `read`, `write`, and `edit` tools take `path`, and `format-all-languages`, `format-org-tables`, and `lint-all-languages` all read `.tool_input.file_path`. A pass-through leaves that field empty and every file hook exits quietly. pi also gives the model-supplied path, which can be relative, so the adapter resolves it against `ctx.cwd` before it writes the payload. Measured tool schemas: `bash` takes `command` and `timeout`, `read` takes `path`, `offset`, `limit`, `write` takes `path` and `content`, `edit` takes `path` and `edits`.

Tool names differ only in case: `Bash` and `bash`, `Read` and `read`, `Write` and `write`, `Edit` and `edit`. `MultiEdit` has no pi counterpart, because pi's `edit` already takes an `edits` array, so one pi tool covers what the Claude matcher `Write|Edit|MultiEdit` covers.

The exit codes map directly. Exit 0 continues. Exit 2 blocks on `tool_call` and becomes `{ isError: true }` with the script's stderr as content on `tool_result`, which is how Claude feeds a failed lint back to the model. Any other exit code is ignored, which preserves the fail-open behaviour the formatting hooks rely on. Two of the hooks, `block-secret-commits` and `enforce-cli-tools`, also print `{"permission":"deny","agent_message":"..."}` on stdout; the adapter should prefer that message as the block reason when it is present.

The wiring can stay in one file. The `hooks` block in `settings.json` is plain JSON that lists the event, the matcher regex, the command, and the timeout. The extension reads that block, maps the pi tool name to the Claude name, applies the same regex, and runs the same command. One manifest, two readers, no second copy to keep in sync. The only wart is the name: a pi extension reading a file called `settings.json` under `.claude/`. Moving the block to `.agents/hooks/hooks.json` would read better but needs a generator, because Claude only accepts its own settings file.

### Rules: two events, both already there

Claude loads a rule with no `paths:` frontmatter at session start, and loads a scoped rule after it reads a file matching one of the globs. The extension reproduces both triggers:

- Unscoped rules are appended to `event.systemPrompt` and returned from `before_agent_start`. There is no `sections` field in 0.85.1: `systemPromptOptions` carries `cwd`, `skills`, `contextFiles`, `customPrompt`, `appendSystemPrompt`, `selectedTools`, `toolSnippets`, and `promptGuidelines`, and it is read-only input for building the prompt. Returning `systemPrompt` chains across handlers and is the only injection point, so every change to the rule text costs a prompt-cache miss. Keep the injected block stable across turns. The other option is `message`, which adds a persistent session message instead of prompt text.
- Scoped rules need the read to happen first. Watch `tool_result` for the `read`, `write`, and `edit` tools, match `event.input.path` against the rule's globs, and append the rule text at the next `context` event, which fires before each LLM call and hands the handler a safe copy of the messages. Same trigger as Claude, one turn of latency at worst.

Parsing the `paths:` frontmatter is the extension's job. pi does not know the field.

### What this costs

One TypeScript file, plus a `package.json` next to it if the glob matching pulls a dependency rather than using the Node built-in. It replaces no hook script and no rule file: both stay single copies under `.agents/`.

A public package covers the same ground and more: [`pi-code.md`](pi-code.md) compares it with the adapter and names the probes that decide between them.

Four risks. The adapter is Claude-shaped, so a change to Claude's hook payload or exit-code contract breaks the pi side silently. Extensions run with full system permissions, and project-local extensions load only after pi trusts the project and only from the current directory, so a project-scoped hook does nothing in an untrusted checkout or when pi starts in a subdirectory. An extension that throws is skipped without a message, even with `--verbose`, so the adapter needs its own log to prove it ran. And `tool_call` in parallel tool mode preflights siblings sequentially but does not guarantee that a handler sees sibling results from the same assistant message, which matters for any hook that assumes it observes every file in a batch.

## The layout that follows

User scope, as chezmoi source names:

```
dot_agents/skills/...            # real content
dot_agents/commands/...          # real content
dot_agents/rules/...             # real content, read by Claude directly and by the pi adapter
dot_agents/hooks/...             # real scripts
dot_agents/AGENTS.md             # real instructions
dot_claude/symlink_skills        # holds ../.agents/skills
dot_claude/symlink_commands      # holds ../.agents/commands
dot_claude/symlink_rules         # holds ../.agents/rules
dot_claude/symlink_CLAUDE.md     # holds ../.agents/AGENTS.md
dot_claude/settings.json         # hooks point at $HOME/.agents/hooks/<name>/hook.sh
dot_agents/extensions/claude-compat.ts  # runs the hooks, injects the rules; in place today
dot_pi/agent/settings.json       # extensions key points at ~/.agents/extensions (in place today), prompts key at ~/.agents/commands
```

Project scope, in any repo this pattern is handed to, is the same shape one level down: a committed `.agents/` with the real files, `.claude/skills`, `.claude/commands`, and `.claude/rules` as committed symlinks, and `CLAUDE.md` as a symlink to `AGENTS.md`.

pi needs no symlink for skills. It needs one settings key for commands, because `~/.agents/commands` is not a path it scans:

```json
{ "prompts": ["~/.agents/commands"] }
```

That one key picks up the whole tree, subdirectories included. It also flattens every name to its basename, so the collisions listed under [what each resource type needs](#what-each-resource-type-needs) must be resolved before the key is set, or three commands disappear without a warning.

### What this costs

Four symlinks per scope, committed to git. Windows needs Developer Mode for a checkout to produce real links, which matters only if this config is ever used on Windows.

Directory symlinks are all or nothing. Everything in `~/.agents/skills/` becomes visible to both agents, with no room for a Claude-only skill in the same tree. Per-resource symlinks stay available for a selective split, and both forms are measured as working, so the choice can be made per resource type later.

APM deploys third-party skills into `~/.claude/skills/`, where `terraform-skill` and `thermo-nuclear-code-quality-review` sit today next to the chezmoi-managed ones. If that directory becomes a symlink, APM writes into `~/.agents/skills/` instead and the vendored skills reach pi for free. That also means the `.agents` tree mixes committed and installed content, exactly as `~/.claude/skills/` does now. Confirm that APM follows the symlink on install before relying on it.

## Recommendation

Adopt `.agents/` as the source of truth for skills, commands, and instructions first. These three are the cheap ones: measured discovery on the Claude side, native or one settings key on the pi side, and no content changes to any file.

Rules and hooks can follow, through one adapter extension rather than a second copy. The prototype already blocks a command in pi with the repo's own hook script and injects both rule kinds, so the remaining work is hardening, not discovery: the `file_path` rename, a log the adapter writes itself, and the stable system-prompt block that keeps the cache warm.

Do this next, in order: rename the colliding command basenames, move `dot_claude/skills/` and `dot_claude/commands/` to `dot_agents/` with the symlink shim, set the pi `prompts` key, measure a full session on both agents, then commit the adapter extension with `enforce-cli-tools` wired first. Port the remaining hooks one at a time, each with a run that proves it fired.
