---
name: context-payload
description: Capture the first API request of a new session in this directory, and rank what it costs.
argument-hint: '[-- claude args, e.g. -- --settings ''{"disableWorkflows":true}'']'
allowed-tools: Bash(python3 ${CLAUDE_SKILL_DIR}/scripts/capture-request.py *), Bash(rm -rf /tmp/claude-request-*)
disable-model-invocation: true
---

## Report

!`python3 ${CLAUDE_SKILL_DIR}/scripts/capture-request.py $ARGUMENTS`

## Your task

The report above comes from a new interactive session in the current directory. The `~tok` column is an estimate. The total input tokens are exact.

1. Show the report unchanged in a code block.
2. List the five largest items that this setup can remove, largest first. For each one, give the estimated tokens and the change that removes it: a bare tool name in `permissions.deny`, a `disable*` key in `settings.json`, `disable-model-invocation: true` for a skill or command, or a shorter memory file. Skip `Agent`, `Bash`, `Read`, `Edit`, `Write`, `Skill`, and `ToolSearch`.
3. If the `MCP servers:` line shows a server as failed or pending, say that its tools are absent from the report.
4. Do not edit a file. Delete the directory on the `Capture:` line.

If the report is an error, show it and stop.
