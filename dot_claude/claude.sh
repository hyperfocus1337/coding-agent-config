#!/usr/bin/env bash
# shellcheck shell=bash
# Source from ~/.bashrc or ~/.zshrc: `. ~/.claude/claude.sh`. Fish loads the
# same functions from ~/.config/fish/conf.d/claude.fish. What each mode loads,
# and its limits: dot_claude/docs/launch-modes.md in the chezmoi source.

claude() { claude-rules --mode claude -- "$@"; }
claude-nohooks() { claude-rules --mode claude-nohooks -- "$@"; }
claude-norules() { claude-rules --mode claude-norules -- "$@"; }
claude-nohooks-norules() { claude-rules --mode claude-nohooks-norules -- "$@"; }
claude-vanilla() { claude-rules --mode claude-vanilla -- "$@"; }
claude-vanilla-minimal() { claude-rules --mode claude-vanilla-minimal -- "$@"; }
claude-full() { claude-rules --mode claude-full -- "$@"; }
claude-include-rules() { claude-rules --include "${1-}" -- "${@:2}"; }
claude-exclude-rules() { claude-rules --exclude "${1-}" -- "${@:2}"; }

claude-rules() { command bash "$HOME/.claude/launch.sh" "$@"; }
