# Disabled built-in tools

`dot_claude/settings-minimal.json` turns off built-in tools and features that this setup does not use by default. The `claude` shell function in `dot_claude/claude.sh` and `dot_config/fish/conf.d/claude.fish` adds it as a `--settings` layer, and `claude-full` starts without it. `syncClaudeAiSkills` stays in `dot_claude/settings.json`, so both commands keep it. Each built-in tool puts its schema in the system prompt of every session, and each listed skill puts its name and description in the skill listing of every session, so an unused tool or skill costs context on every turn.

The source is the video [Claude Code's system tools are SO BLOATED](https://www.youtube.com/shorts/oLx4yCbeklQ) by Matt Pocock. The article [How To Kill The Bloat In Claude Code's System Prompt](https://www.aihero.dev/how-to-kill-the-bloat-in-claude-codes-system-prompt) gives the same settings and shows how to measure the tool tokens per request with a logging proxy set in `ANTHROPIC_BASE_URL`. The [`/context-payload`](../../../dot_claude/skills/README.md#context-payload) skill records the same request without a proxy, through the official `OTEL_LOG_RAW_API_BODIES` setting.

Set 2026-09-26. On that date, all five `disable*` keys were checked against the published [settings schema](https://www.schemastore.org/claude-code-settings.json). `syncClaudeAiSkills` is not in that schema, but the schema allows other keys, and the [settings reference](https://code.claude.com/docs/en/settings-reference#syncclaudeaiskills) documents it.

## Denied tools

A tool name in `permissions.deny` removes that tool from the session. Because a deny rule in any settings source wins over an allow rule, a project cannot turn the tool back on.

| Tool                                   | What stops working                                          |
| -------------------------------------- | ----------------------------------------------------------- |
| `EnterPlanMode`, `ExitPlanMode`        | The model cannot enter or leave plan mode by itself         |
| `CronCreate`, `CronDelete`, `CronList` | `/loop` with an interval, and scheduled prompts             |
| `ScheduleWakeup`                       | `/loop` without an interval (self-paced mode)               |
| `ReportFindings`                       | The typed findings list that `/code-review` renders         |
| `SendMessage`                          | Messages to running subagents, teammates, and sessions      |
| `SendFeedback`                         | Feedback drafts that the model queues for your approval     |
| `PushNotification`                     | Push notifications to the phone or desktop app              |
| `RemoteTrigger`                        | Triggers for remote and cloud sessions                      |
| `DesignSync`                           | Design sync                                                 |
| `NotebookEdit`                         | Jupyter notebook cell edits; `Edit` on raw JSON still works |

## Disabled features

| Key                         | Effect                                                                                                                        |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `disableBundledSkills`      | Removes the skills and workflows that ship with Claude Code. Built-in commands such as `/init` stay typable.                  |
| `disableWorkflows`          | Removes dynamic workflows and the bundled workflow commands.                                                                  |
| `disableRemoteControl`      | Blocks `claude remote-control`, the `--remote-control` flag, and the in-session toggle.                                       |
| `disableClaudeAiConnectors` | Stops the fetch and connection of claude.ai MCP connectors.                                                                   |
| `enableArtifact: false`     | Removes the `Artifact` tool, which publishes output as a web page on claude.ai. It replaces the deprecated `disableArtifact`. |
| `syncClaudeAiSkills: false` | Stops the download of the claude.ai account skills and moves the synced ones to `~/.claude/skills/.trash/`.                   |

`dot_claude/settings-minimal.json` also sets these keys to `false`, so you can turn each one on in the file. With `false`, the feature runs, the same as when the key is not set.

| Key                          | Effect when `true`                                                                                             |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `disableRemoteControl`       | See the table above.                                                                                           |
| `disableAgentView`           | Removes `claude agents`, `--bg`, `/background`, and the on-demand supervisor.                                  |
| `disableSkillShellExecution` | Replaces each `` !`...` `` block in skills and commands with a notice. The `git:*` commands need these blocks. |
| `disableAllHooks`            | Stops hooks, the custom status line, and the custom file suggestion command. `claude-nohooks` sets it.         |

`disableAutoMode` and `disableDeepLinkRegistration` accept only the string `"disable"`, which has no "off" form, so the file does not contain them.

## Skills lost to `disableBundledSkills`

To find these skills on Claude Code 2.1.283, two headless sessions listed their skills: one with `--settings '{"disableBundledSkills":false}'` and one with the settings in this repo. The skills below were in the first list only.

| Skill                       | Purpose                                                               |
| --------------------------- | --------------------------------------------------------------------- |
| `/claude-api`               | Reference for the Claude API and the Anthropic SDK                    |
| `/code-review`              | Review the diff, a branch, or a PR for correctness bugs               |
| `/dataviz`                  | Design rules for charts, graphs, and dashboards                       |
| `/fewer-permission-prompts` | Add an allowlist of read-only commands from past transcripts          |
| `/keybindings-help`         | Change the keyboard shortcuts in `~/.claude/keybindings.json`         |
| `/loop`                     | Run a prompt or command again on an interval                          |
| `/run`                      | Start the project's app to see a change work                          |
| `/schedule`                 | Create and manage scheduled cloud agents (routines)                   |
| `/simplify`                 | Find reuse, simplification, and efficiency cleanups, then apply them  |
| `/update-config`            | Change `settings.json`: hooks, permissions, and environment variables |

`/init` and `/security-review` are built-in commands, not bundled skills, so the model no longer sees them, but you can still type them.

## Artifact skills

The `artifact-design`, `artifact-diagramming`, and `artifact-capabilities` skills go with the `Artifact` tool. In the Claude Code 2.1.296 binary, `artifact-design` and `artifact-diagramming` are enabled only when the Artifact feature is on, so `enableArtifact: false` hides them. `artifact-capabilities` has a different check, and the binary does not show if `enableArtifact` affects it. A headless test did not show any of the three skills with `enableArtifact` set to `true` or `false`, so the test does not confirm this.

To hide all three in every session, `dot_claude/settings.json` sets each one to `"off"` in `skillOverrides`. `"off"` hides a skill from the model and from the `/` menu. The key must stay in `settings.json`: Claude Code reads `skillOverrides` only from user, project, and local settings, and ignores it in the `--settings` layer that loads `settings-minimal.json`. As a result, `claude-full` also hides the three skills.

The `$comment` key at the top of `settings.json` records this, because JSON has no comment syntax. When you change a skill in `/skills`, Claude Code rewrites `skillOverrides`, and it can also remove the `$comment` key. This was not tested.

## Skills lost to `syncClaudeAiSkills: false`

Claude Code downloads the skills enabled for the claude.ai account into `~/.claude/skills/synced/` and lists them as `anthropic-skills:<name>`. With `syncClaudeAiSkills: false` in user settings, Claude Code stops the download at the next start, stops loading those skills, and moves them to `~/.claude/skills/.trash/`, where they stay until the retention sweep deletes them. The setting affects only sessions that read this machine's `~/.claude/settings.json`:

| Surface                                 | Affected | Why                                                                            |
| --------------------------------------- | -------- | ------------------------------------------------------------------------------ |
| Claude Code CLI                         | Yes      | Reads `~/.claude/settings.json`                                                |
| Claude Desktop, Code tab, local session | Yes      | Desktop shares `~/.claude/settings.json` with the CLI                          |
| Claude Desktop, Code tab, SSH session   | No       | Reads `~/.claude/` on the remote host                                          |
| Claude Desktop, Code tab, cloud session | No       | Loads the account skills and does not read the local `~/.claude/`              |
| Claude Desktop, Cowork tab              | No       | Loads the skills from the **Customize** configuration of the claude.ai account |
| Claude Desktop chat                     | No       | Uses the skills of the claude.ai account                                       |

To turn a skill off on every surface, turn it off in **Customize** in the Desktop sidebar or in the claude.ai skill settings. `pdf` and `xlsx` always sync, so this setting does not remove them.

The table lists the 16 skills that a session on 2026-09-26 received before the change. Chars is the length of the listing line for each skill, and the total also counts one newline per skill.

| Skill                 |      Chars | Purpose                                                    |
| --------------------- | ---------: | ---------------------------------------------------------- |
| `docs`                |      1,004 | Shared docs through the claude.ai docs connector           |
| `pptx`                |        985 | Create, read, and edit PowerPoint files                    |
| `google-workspace`    |        982 | Create and edit Google Docs, Sheets, and Slides            |
| `xlsx`                |        975 | Create, read, and edit spreadsheet files                   |
| `computer-use`        |        969 | Control desktop apps through the Claude desktop app        |
| `docx`                |        959 | Create, read, and edit Word files                          |
| `built-in-browser`    |        856 | Use the browser pane of the Claude desktop app             |
| `chrome-browser`      |        786 | Use the Claude in Chrome extension                         |
| `meeting-summarizer`  |        738 | Summarize a meeting transcript; a flagged local copy stays |
| `deep-research`       |        604 | Research a topic across sources with subagents             |
| `pdf`                 |        461 | Read, create, merge, split, and fill PDF files             |
| `morning`             |        367 | Render the morning brief                                   |
| `skill-creator`       |        353 | Create and evaluate skills                                 |
| `import-memory`       |        173 | Import a memory export from another assistant              |
| 2 organization skills |      1,545 | Organization variants of `docx` and `pptx`                 |
| **Total**             | **11,773** |                                                            |

Five of these skills need tools that a terminal session here does not have: `docs`, `google-workspace`, `computer-use`, `built-in-browser`, and `chrome-browser`. For PDF and Office files, the local `markitdown` skill still converts them to Markdown. To keep some account skills, remove the key and set the others to `"off"` in `skillOverrides`, or turn them off in the claude.ai skill settings.

## Turn a feature back on

1. For one session, run `claude-full`. To change the default, remove the tool from `permissions.deny` or the `disable*` key from `dot_claude/settings-minimal.json`, or remove `syncClaudeAiSkills` from `dot_claude/settings.json`.
2. Run `just chezmoi` to apply the change (see [`.claude/rules/apply.md`](../../../.claude/rules/apply.md) for the host and the devcontainer).
3. Restart Claude Code.

## Environment variables

Three of the keys also have an environment variable with the same effect.

| Key                     | Environment variable                 |
| ----------------------- | ------------------------------------ |
| `disableBundledSkills`  | `CLAUDE_CODE_DISABLE_BUNDLED_SKILLS` |
| `disableWorkflows`      | `CLAUDE_CODE_DISABLE_WORKFLOWS`      |
| `enableArtifact: false` | `CLAUDE_CODE_DISABLE_ARTIFACT`       |
