# Prompt jump

`Cmd+Up` moves to the start of the whole prompt. `Cmd+Down` moves to its end. These shortcuts do not scroll the transcript or browse prompt history. Ordinary arrows, undo, paste expansion, and slash-command tracking keep their existing behavior.

Pi 1.4.0 has no built-in whole-prompt movement action. This extension wraps the existing editor instance instead of replacing it. It only runs in terminal UI mode and needs no Pi settings or keybindings file.

## cmux setup

cmux reads terminal bindings from the host's Ghostty configuration. The existing host dotfiles at `/workspaces/projects/chezmoi/dot_config/ghostty/config` already map `Cmd+Up/Down` to `Ctrl+Alt+Shift+Up/Down` for Emacs. This extension also accepts those sequences, so keep those bindings unchanged.

For a terminal without those existing mappings, if the keys scroll the terminal or do nothing, add these lines to `~/.config/ghostty/config` on the macOS host:

```ini
keybind = super+up=text:\x1b[1;9A
keybind = super+down=text:\x1b[1;9B
```

These bindings send the Super-modified arrow sequences that the extension handles. They apply to all terminal applications, not only Pi. Reload the terminal configuration or open a new cmux terminal surface. If a cmux shortcut owns either key, clear or reassign it in **Settings > Keyboard Shortcuts** first.

References: [cmux Ghostty bindings](https://github.com/manaflow-ai/cmux/blob/main/docs/ghostty-keybindings.md), [Ghostty keybinding actions](https://ghostty.org/docs/config/keybind/reference).

## Diagnose terminal input

Run `/prompt-jump-debug`, then press `Cmd+Up`. The command shows the raw sequence Pi receives and whether it recognizes prompt-start or prompt-end movement. Repeat for `Cmd+Down`. If the diagnostic does not close, press Escape: the terminal or cmux may have consumed the original key before Pi received it. If the command is missing after `/reload`, the running Pi session has not loaded this extension.

The diagnostic captures only the next input in its temporary screen. It does not edit the prompt or change Ghostty or Emacs bindings.

## Check

Run `just pi-check`. The checks use the installed Pi editor and load the extension through Pi's loader.

After `just chezmoi`, run `/reload` in Pi:

1. Enter three lines with `Shift+Enter`.
2. Press `Cmd+Up` and type a character. It must appear before the first line.
3. Press `Cmd+Down` and type another character. It must appear after the last line.
4. Repeat with a prompt longer than the visible editor area.

This manual check verifies cmux forwarding, which the container tests cannot check.
