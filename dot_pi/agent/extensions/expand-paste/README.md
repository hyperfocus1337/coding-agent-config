# Expand paste

Paste large text once to get Pi's collapsed `[paste #…]` marker. Paste the same text again, without an intervening key, to replace that marker with its full editable text. A third paste inserts another copy normally.

This works with terminal paste, including Cmd+V on macOS. Pi controls when text collapses: more than 10 lines or more than 1000 characters in Pi 1.4. Short text, different clipboard content, image paste, and prompt submission keep native behavior. Expansion is one undo step.

Typing or moving the cursor cancels the pending expansion. The editor text and cursor must also remain unchanged. There is no time limit between the two pastes.

The extension wraps the existing editor, so the inline slash-command completion and slash-usage tracking extensions remain active. It has no settings, commands, or extra dependencies. Run `/reload` after installation.

## Checks

Run `just pi-check`. The self-check uses the installed Pi editor to check collapse limits, repeat paste, undo, cursor position, normalization, chunked terminal input, cancellation, and submission.

See [implementation](docs/implementation.md) for the private API constraint.
