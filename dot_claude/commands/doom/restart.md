---
allowed-tools: Bash(cd:*), Bash(git checkout:*), Bash(git pull:*), Bash(git submodule:*), Bash(doom:*), Bash(git status:*), Bash(emacsclient:*), Bash(emacs:*)
description: Tangle the config, sync Doom (same steps as /doom:sync), and restart the Doom daemon
disable-model-invocation: true
---

## Context

- Tangle output: !`emacsclient -s doom -e t >/dev/null 2>&1 || emacs --init-directory=$HOME/.emacs.d --daemon=doom; emacsclient -s doom -e "(let ((org-confirm-babel-evaluate nil)) (org-babel-tangle-file \"$HOME/.local/share/chezmoi/dot_doom.d/config.org\"))"`
- Sync output: !`cd ~/.emacs.d && git checkout master && git pull && git submodule update --init && doom sync && git status`
- Restart output: !`emacsclient -s doom -e '(kill-emacs)' >/dev/null 2>&1; emacs --init-directory=$HOME/.emacs.d --daemon=doom && echo "daemon restarted on socket doom"`

## Your task

Report the result of the three steps above in a few lines. The tangle step starts the `doom` daemon if none runs, tangles the chezmoi source `config.org` in it, and prints the list of tangled files. The restart step stops the daemon and starts a new one on socket `doom`, which closes every attached frame. If a step failed, quote the error and say which later steps did not run.
