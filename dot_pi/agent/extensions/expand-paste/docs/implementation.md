# Implementation

`index.ts` captures the current editor factory during `session_start` and wraps the editor it returns. Without a factory, it creates Pi's `CustomEditor`. This preserves application shortcuts and other editor extensions. The extension is inactive outside TUI mode.

`paste.ts` wraps Pi's existing `handlePaste` method rather than buffering terminal input itself. Pi still decodes, normalizes, filters, and collapses the first paste. The wrapper records the raw input, resulting marker, editor text, and cursor position. Any non-paste key clears that record. Pi's `isInPaste` flag keeps split terminal paste events from clearing it.

An identical second paste expands only the recorded marker, and only if text and cursor position still match. The wrapper takes a native undo snapshot, removes the marker from its line and paste storage, and inserts the stored, sanitized content through Pi's internal insertion method. This preserves other collapsed pastes, nearby text, cursor position, and change notifications. A third paste follows native behavior.

## Private API constraint

Pi 1.4 has no public API for expanding one paste marker. The wrapper uses `handlePaste`, `isInPaste`, `state`, `pastes`, `lastAction`, `cancelAutocomplete`, `exitHistoryBrowsing`, `pushUndoSnapshot`, and `insertTextAtCursorInternal`. It checks the required methods and storage before installing its wrappers. An unsupported editor keeps its native behavior and produces a warning.

The self-check runs against the installed editor rather than a copy of its implementation. Run `just pi-check` after a Pi upgrade. Replace the private access with a public single-marker expansion API if Pi adds one.

Programmatic clipboard insertion, such as Pi's Ctrl+V image action, does not pass through `handlePaste` and is not changed. Terminal text paste does pass through it, including Cmd+V on macOS.
