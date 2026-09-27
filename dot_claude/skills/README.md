# skills

Skills are on-demand instructions Claude reads when a task calls for them. Each is a directory holding `SKILL.md`, whose frontmatter `description` decides when the skill is offered. Only the name and description sit in context at session start; the body loads on invocation, which is what keeps a large catalog cheap.

A skill with `disable-model-invocation: true` never loads on its own. You reach it by name, or another skill routes to it.

## Install routing

| Skill                                                 | Description                                                                                                        |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| [`install-agent-resources`](install-agent-resources/) | Entry point. Resolves a request by id across the MCP, skill, and plugin catalogs, then hands off. Runs no install. |
| [`install-mcp`](install-mcp/)                         | Installs a cross-agent MCP server through `apm.yml`, at project, local, or user scope.                             |
| [`install-skills`](install-skills/)                   | Installs a skill through APM, a repo-local copy, or a vendor CLI.                                                  |
| [`install-plugins`](install-plugins/)                 | Installs a Claude Code plugin from the curated catalog.                                                            |
| [`install-bootstrap`](install-bootstrap/)             | Writes the `SessionStart` bootstrap hook into a repo, so a cloud session starts with the same config as a laptop.  |

The four channel skills carry `disable-model-invocation: true`. Start from `install-agent-resources`, which asks when one id exists in two catalogs. The point of scoped installs is that a resource costs context only where it is used; [`docs/scope/`](../../docs/scope/) records which resources belong at which scope.

## Task skills

| Skill                                       | Description                                                                                                     |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| [`markitdown`](markitdown/)                 | Converts PDF, Office, image, audio, HTML, and archive files to Markdown with the `markitdown` CLI.              |
| [`technical-writing`](technical-writing/)   | Writes or edits technical English against Google developer documentation style plus ASD-STE100 principles.      |
| [`meeting-summarizer`](meeting-summarizer/) | Turns a meeting or call transcript into a structured English summary with decisions and an action-items table.  |
| [`organize`](organize/)                     | Reorganizes a config or code file into labeled, comment-delimited sections, prompting for a header style first. |
| [`explain-diff`](explain-diff/)             | Builds a self-contained HTML explainer of a code change: background, intuition, diagrams, and a quiz.           |
| [`context-payload`](context-payload/)       | Captures the first API request of a new session, and ranks what it costs.                                       |

`markitdown` backs the rule in `rules/tools.md` that a binary document is converted before it is read. `organize` declares the skill name `organize-with-comments` and pairs with the `/organize:*` commands, which pick a header style without the prompt.

## Context payload

`/context-payload` runs [`capture-request.py`](context-payload/scripts/capture-request.py) and puts its report in the prompt.
The script records what Claude Code sends, instead of what the files on disk predict.
It starts an interactive `claude` session in a pseudo-terminal, sends one short prompt, and stops the session after the first response.
The official `OTEL_LOG_RAW_API_BODIES=file:<dir>` setting writes the full request body to disk, so no logging proxy is necessary.
A run takes about 6 seconds and sends one request: 17,825 input tokens in this repo, most of them cache reads.

The report ranks tool schemas, system prompt blocks, memory files, and the skill and agent listings.
The total input tokens come from the response usage and are exact.
The per-part tokens split that total by character share.
The skill then names the five largest items you can remove, and the setting that removes each one.
It edits no file.

Arguments after `--` go to `claude`, so you can measure a settings change before you make it:

```
/context-payload -- --settings '{"disableWorkflows":true}'
```

The script also runs outside a session:

```
python3 ~/.claude/skills/context-payload/scripts/capture-request.py
python3 ~/.claude/skills/context-payload/scripts/capture-request.py --dir /tmp/claude-request-abc123
```

Limits:

- The session runs in the current directory, because project settings and rules change the payload. The directory must be trusted, or the session waits at the trust prompt until the timeout.
- MCP servers connect in the background. The script types the prompt after each server has connected or failed, or after 60 seconds. The `MCP servers:` line shows the state of each server. A failed or pending server has no tools in the report.
- `--print` sends a different system prompt and fewer tools, so the script uses the interactive session. On Claude Code 2.1.283 that session left no transcript, so it does not show in `/resume`.
- The capture directory holds your instructions and account details. The skill deletes it. When you run the script directly, delete it yourself.

For the static view of what is on disk, including disabled skills, see [`scripts/context-budget/`](../../scripts/context-budget/README.md).

Third-party skills do not live here. They arrive through APM or a plugin, and every channel is mapped in [`docs/sources/channels.md`](../../docs/sources/channels.md).

## Explain-diff sources

The `explain-diff` prompt is adapted from Geoffrey Litt's `/explain-diff`. Keep these for reference when the skill is revised:

- [Gist](https://gist.github.com/geoffreylitt/a29df1b5f9865506e8952488eac3d524): the original prompt this skill is based on.
- [Understanding is the new bottleneck](https://www.geoffreylitt.com/2026/07/02/understanding-is-the-new-bottleneck.html): the argument for the format. An agent writes code faster than a human reads a raw diff, so the explainer teaches the background and the intuition first, and the quiz measures what the reader understood.
- [Talk](https://www.youtube.com/watch?v=WkBPX-oDMnA): the same argument on video.
