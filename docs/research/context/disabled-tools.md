# Disabled built-in tools

`dot_claude/settings.json` turns off built-in tools and features that this setup does not use by default. Each built-in tool puts its schema in the system prompt of every session, so an unused tool costs context on every turn.

The source is the video [Claude Code's system tools are SO BLOATED](https://www.youtube.com/shorts/oLx4yCbeklQ) by Matt Pocock. The article [How To Kill The Bloat In Claude Code's System Prompt](https://www.aihero.dev/how-to-kill-the-bloat-in-claude-codes-system-prompt) gives the same settings, and shows how to measure the tool tokens per request with a logging proxy set in `ANTHROPIC_BASE_URL`.

Set 2026-09-26. All five `disable*` keys were checked against the published [settings schema](https://www.schemastore.org/claude-code-settings.json) on that date.

## Denied tools

A tool name in `permissions.deny` removes that tool from the session.
A deny rule in any settings source wins over an allow rule, so a project cannot turn the tool back on.

| Tool                                   | What stops working                                          |
| -------------------------------------- | ----------------------------------------------------------- |
| `EnterPlanMode`, `ExitPlanMode`        | The model cannot enter or leave plan mode by itself         |
| `CronCreate`, `CronDelete`, `CronList` | `/loop` with an interval, and scheduled prompts             |
| `ScheduleWakeup`                       | `/loop` without an interval (self-paced mode)               |
| `ReportFindings`                       | The typed findings list that `/code-review` renders         |
| `SendMessage`                          | Messages to running subagents, teammates, and sessions      |
| `PushNotification`                     | Push notifications to the phone or desktop app              |
| `RemoteTrigger`                        | Triggers for remote and cloud sessions                      |
| `DesignSync`                           | Design sync                                                 |
| `NotebookEdit`                         | Jupyter notebook cell edits; `Edit` on raw JSON still works |

## Disabled features

| Key                         | Effect                                                                                                       |
| --------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `disableBundledSkills`      | Removes the skills and workflows that ship with Claude Code. Built-in commands such as `/init` stay typable. |
| `disableWorkflows`          | Removes dynamic workflows and the bundled workflow commands.                                                 |
| `disableRemoteControl`      | Blocks `claude remote-control`, the `--remote-control` flag, and the in-session toggle.                      |
| `disableClaudeAiConnectors` | Stops the fetch and connection of claude.ai MCP connectors.                                                  |
| `disableArtifact`           | Removes the `Artifact` tool, which publishes output as a web page on claude.ai.                              |

## Skills lost to `disableBundledSkills`

Measured on Claude Code 2.1.283: two headless sessions listed their skills, one with `--settings '{"disableBundledSkills":false}'` and one with the settings in this repo. The skills below were in the first list only.

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

`/init` and `/security-review` are built-in commands, not bundled skills. The model no longer sees them, but you can still type them.

The `artifact-design`, `artifact-diagramming`, and `artifact-capabilities` skills go with the `Artifact` tool, which `disableArtifact` already removes.

The headless test did not show them with either setting, so this page does not confirm which of the two keys removes them.

## Turn a feature back on

1. In `dot_claude/settings.json`, remove the tool from `permissions.deny`, or set the `disable*` key to `false`.
2. Run `just chezmoi` to apply the change (see [`.claude/rules/apply.md`](../../../.claude/rules/apply.md) for the host and the devcontainer).
3. Restart Claude Code.

## Environment variables

Three of the keys also have an environment variable with the same effect.

| Key                    | Environment variable                 |
| ---------------------- | ------------------------------------ |
| `disableBundledSkills` | `CLAUDE_CODE_DISABLE_BUNDLED_SKILLS` |
| `disableWorkflows`     | `CLAUDE_CODE_DISABLE_WORKFLOWS`      |
| `disableArtifact`      | `CLAUDE_CODE_DISABLE_ARTIFACT`       |
