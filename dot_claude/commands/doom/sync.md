---
allowed-tools: Bash(cd:*), Bash(git checkout:*), Bash(git pull:*), Bash(git submodule:*), Bash(doom:*), Bash(git status:*)
description: Update ~/.emacs.d to the latest master and run doom sync
disable-model-invocation: true
---

## Context

- Sync output: !`cd ~/.emacs.d && git checkout master && git pull && git submodule update --init && doom sync && git status`

## Your task

Report the result of the sync above in a few lines: the commit pulled, whether `doom sync` succeeded, and any files `git status` lists. If a step failed, quote the error and stop.
