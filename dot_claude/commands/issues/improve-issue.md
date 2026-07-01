---
name: improve-issue
description: Fetch a GitHub issue and rewrite its description to be clearer, more actionable, and better structured
allowed-tools: Bash(gh *)
---

## Context
- Issue body: !`gh issue view $ARGUMENTS --json title,body,labels,assignees,comments`

## Your task
You are a senior engineering lead reviewing this GitHub issue for clarity and actionability.

Rewrite the issue description to include:
1. **Problem statement** — what is broken or missing, and what the user expects instead
2. **Steps to reproduce** (if a bug) or **Acceptance criteria** (if a feature)
3. **Context** — environment, version, relevant config
4. **Proposed solution or open questions** (optional but valuable)

Rules:
- Keep the author's intent intact — improve clarity, not scope
- Use concise markdown with headers
- Flag any missing information you'd need to fully understand the issue
- Output the improved text ready to paste or use with `gh issue edit $ARGUMENTS --body "..."`

