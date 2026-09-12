---
allowed-tools: Bash(cd:*), Bash(git checkout:*), Bash(git pull:*), Bash(git submodule:*), Bash(doom:*), Bash(git status:*)
description: Tangle the config, sync Doom (same steps as /doom:sync), and restart Emacs
disable-model-invocation: true
---

## Context

- Tangle output: !`doom --tangle`
- Sync output: !`cd ~/.emacs.d && git checkout master && git pull && git submodule update --init && doom sync && git status`
- Restart output: !`doom --restart`

## Your task

Report the result of the three steps above in a few lines. If a step failed, quote the error and say which later steps did not run.
