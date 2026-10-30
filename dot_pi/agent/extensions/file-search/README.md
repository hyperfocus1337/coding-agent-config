# File search

Search the current Git repository with `@filename`, even when Pi starts in a subfolder. Pi keeps its working folder. Selected repository files use paths relative to that folder.

For example, from `my-project/src/`, type `@design`. A matching document in the parent folder appears as `../design.md`. Select it to insert `@../design.md`.

## Behaviour

- Search the working folder and the Git root returned by `git rev-parse --show-toplevel`.
- Keep native completion for explicit paths such as `@../`, `@~/`, and `@/absolute/path/`, and for commands and ordinary paths.
- Reuse Pi's filename/path matching, ignore rules, hidden-file handling, cancellation, and search bounds. This does not search file contents or change Pi's matching algorithm.
- Rank exact filenames before filename prefixes and other matches. Prefer working-folder results when match quality is equal.
- Show up to 20 results in one path column that uses the available menu width. This avoids clipping filenames in Pi's narrow filename column and distinguishes identical filenames without repeating the path. Paths longer than the terminal width can still be clipped. Deduplicate targets across overlapping roots.
- Keep native quoting and directory insertion. Files with double quotes or line breaks in their paths are not added from broader search roots.
- Do not add symlink targets outside a broader search root. Built-in working-folder completion is unchanged.

The extension runs only in the terminal UI. It does not change the agent's tools, working folder, permissions, or model context. The repository root is a search scope, not a security sandbox.

## Additional folders

No additional folders are configured by default. To add them later, create `~/.pi/agent/file-search.json` with this structure:

```json
{
  "extraRoots": ["~/projects/shared-docs"]
}
```

Entries must be absolute paths or start with `~/`. Additional folders apply to every interactive session that loads this user extension. Files outside the current repository use a home-relative path where possible, or an absolute path. Paths must exist in the environment where Pi runs; this does not mount Mac files into a container.

Use `/reload` after changing the configuration. Missing folders produce a warning and do not disable the remaining roots. Invalid configuration produces a warning and leaves automatic Git-root search active. Outside Git, only the working folder and configured additional folders are searched.

## Loading and disabling

chezmoi installs this directory under `~/.pi/agent/extensions/file-search/`; Pi discovers `index.ts` automatically. No settings entry is needed. Use `/reload` in an existing Pi session after installation.

Use these commands to compare the extension with native Pi completion without restarting or reloading:

| Command               | Effect                                               |
| --------------------- | ---------------------------------------------------- |
| `/file-search`        | Toggle the extension on or off.                      |
| `/file-search on`     | Enable broader search and single-column paths.       |
| `/file-search off`    | Use native search and the native two-column display. |
| `/file-search status` | Show the current state without changing it.          |

After switching, type the same `@` query again to compare results. The toggle changes neither files nor saved settings.

Each new session or `/reload` starts enabled. If no broader search roots are available, the status reports that native completion is in use even when the toggle is on.

Set `PI_FILE_SEARCH=0` before starting Pi to disable startup discovery and registration of the completion wrapper. The command cannot override this environment variable. To uninstall the extension, remove its installed directory as well as its source; chezmoi does not remove deleted source files automatically.

The extension uses Pi's managed `~/.pi/agent/bin/fd`, system `fd`, or `fdfind`. If none is available, it warns and keeps built-in completion. It does not download executables.

## Checks

Run `just pi-check` from the configuration repository. The file-search check uses temporary Git repositories and Pi's installed completion provider and extension loader. It covers search scope, insertion, quoting, ranking, overlap, ignored files, cancellation, configuration validation, failure fallback, and UI-only registration. See [implementation notes](docs/implementation.md).
