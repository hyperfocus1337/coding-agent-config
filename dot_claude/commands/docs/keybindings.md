---
description: Document commands and keybindings as rows in the keybindings table.
argument-hint: <commands | keybindings | prose | path[:lines]>
disable-model-invocation: true
---

Input: $ARGUMENTS

Document every command and keybinding in the input as rows in the keybindings table of the section it belongs to. One row per command: description, command, keybinding. Add rows to an existing table before starting a new one.

If the input names a file, read the commands and keybindings from that file, or only from the given lines.
