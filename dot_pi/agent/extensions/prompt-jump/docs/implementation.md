# Implementation

On `session_start` in TUI mode, capture the current editor factory and wrap its editor's `handleInput`. If there is no factory, create Pi's `CustomEditor`. Keep the same editor instance to preserve the wrappers from `expand-paste`, `slash-usage`, and the editor from `claude-commands`.

Use Pi's `matchesKey` for `super+up` and `super+down`, plus `ctrl+alt+shift+up/down` from the host's existing Emacs-compatible Ghostty mappings. Forward all other input, including data received during bracketed paste, to the captured handler. Before a jump, clear character-jump mode and autocomplete. Call native `pageScroll` with negative or positive infinity to clamp movement to the first or last visual line, then call native line-start or line-end movement. Request a render without changing text, paste storage, history, or undo snapshots.

Pi 1.5.2 exposes no public cursor setter. The extension checks the internal movement methods and paste flag before it installs the wrapper. Unsupported editors get one warning per factory call and remain unchanged. Replace this internal API use with native whole-prompt movement actions or a public cursor setter when Pi provides them.

`test/check.ts` loads the extension through the installed Pi loader and uses its `CustomEditor`. Checks cover empty prompts, trailing newlines, Unicode, wrapped lines, repeated jumps without history navigation, undo, ordinary arrows, submission, autocomplete cancellation, bracketed paste, unsupported editors, and composition with paste expansion and submission tracking. Host cmux key forwarding still needs the manual check in the README.
