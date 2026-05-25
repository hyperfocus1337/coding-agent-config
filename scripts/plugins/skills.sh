#!/bin/bash

set -e

# Matt Pocock skills
# https://github.com/mattpocock/skills
npx skills@latest add mattpocock/skills \
  --skill grill-me \
  --skill grill-with-docs \
  --skill handoff \
  --skill improve-codebase-architecture \
  --skill setup-matt-pocock-skills \
  --skill tdd \
  --skill triage \
  --skill to-issues \
  --skill to-prd \
  --agent claude-code \
  --agent cursor \
  --agent opencode \
  --global \
  --yes
