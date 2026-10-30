# Implementation

`index.ts` registers only a `session_start` handler. In TUI mode, `addAutocompleteProvider` adds a wrapper around the current provider. `usage.ts` delegates all operations and sorts a copy of the suggestions only when their prefix is exactly `/`. The wrapper keeps each item's value, label, description, and completion behavior. A stable sort preserves native ordering for equal counts and times.

## Submission tracking

The handler captures `getEditorComponent()` and installs a factory that calls that existing factory, or creates Pi's `CustomEditor` if none exists. Pi installs `onSubmit` after calling the factory. `trackSubmissions` therefore defines an accessor on the returned editor that wraps subsequent `onSubmit` assignments. It records the actual submitted text, not raw Enter keys, so menu selection, custom submit bindings, and multiline editing keep their normal behavior. The existing callback receives each submission once.

This uses the public editor contract in Pi 1.4.0. In this repository, `claude-commands` loads before `slash-usage` and supplies the existing editor. Pi clears custom editors and autocomplete wrappers when it replaces the extension runtime, so reload and session changes do not accumulate wrappers. A later extension that replaces the editor must preserve the current factory if it needs this tracking.

## Persistence

The log uses JSON arrays of `[commandName, timestamp]`. A submission appends one record synchronously before the command runs, including commands such as `/reload` and `/quit`. Separate newline boundaries let a later append recover after a partial record. Append-only storage avoids read-modify-write data loss between sessions.

New files use mode `0600`. Reads validate record shape, command names, and timestamps and ignore invalid records without rewriting the file.

The log is replayed on each bare-menu request. This keeps sessions consistent without a watcher, lock file, or dependency. For a history large enough to cause a visible pause, replace log replay with transactional SQLite counters. No compaction runs now because concurrent compaction would require coordination.

## Checks

Run `just pi-check`. The checks use the installed Pi autocomplete provider and extension loader. They cover count and recency ranking, stable native ordering, typed and argument completion, completion application, concurrent-session visibility, partial and invalid records, argument privacy, repeated callback assignment, composition with an existing editor, non-TUI startup, and storage errors that must not block submission.
