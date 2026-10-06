# stale

Reports leftover files after a rename or a move in each directory that chezmoi manages directly under `~/.claude/` (`commands`, `hooks`, `rules`, `skills`). The script reads that list from `chezmoi managed`, so a new top-level directory in `dot_claude/` is scanned without an edit. [`stale.sh`](stale.sh) reads only, unless you pass `--delete`.

## What counts as stale

| Check                                                                                                         | Why the path is left behind                                                                                                                                       |
| ------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A path in one of those directories that `chezmoi unmanaged` lists                                             | `chezmoi apply` writes the new path but never deletes the old one, so a rename in `dot_claude/` deploys twice. A path that `.chezmoiignore` covers is not listed. |
| An empty directory in one of those directories, in `dot_claude/` or in the deployed copy                      | The files moved out, the directory stayed.                                                                                                                        |
| A `dir` in [`skills.json`](../../dot_claude/skills/install-skills/references/skills.json) that does not exist | The catalog row still points at the directory's old path.                                                                                                         |

The first check skips the paths that a channel other than chezmoi owns, so they are not reported as stale:

- the skills that `apm.yml` installs, read with `yq` from `dependencies.apm` (a `skills:` subset if the entry has one, else the last segment of the `git:` ref)
- `~/.claude/skills/synced/`, which Claude Code writes

## Running it

```bash
just stale
```

Exit code 0 means no stale paths. Exit code 1 means the report lists at least one, so the recipe also works as a lint gate. Set `HOME` to scan a different deployed copy, for example a test tree with a planted leftover:

```bash
HOME=/tmp/fakehome scripts/inspect/stale.sh
```

## Why a script and not a chezmoi feature

chezmoi has three related features, and none covers the whole job:

- `chezmoi unmanaged` is the report for the first check, and the script calls it. It does not know which unmanaged paths another channel owns, so the script filters out the APM skills and `synced/`.
- The `exact_` directory prefix makes `chezmoi apply` delete unmanaged entries itself, and it keeps entries from `.chezmoiignore`. It is not recursive: every subdirectory to prune needs its own `exact_`, so every directory under `dot_claude/skills` and `dot_claude/commands` would be renamed, and the APM skill names would be duplicated into `.chezmoiignore`.
- `.chezmoiremove` deletes listed targets on apply. It needs the old path written by hand after each rename, so it detects nothing.

Empty source directories and stale catalog rows have no chezmoi equivalent.

## Deleting the stale paths

```bash
just clean-stale
```

This runs the same report, then asks once before it removes every path from the first two sections with `rm -rf`. It exits 0 after the removal and 1 on abort. Read the report before you answer `y`: a file you added by hand under `~/.claude/` and never tracked in the repo also shows up in the first check. The third section (catalog rows) is never deleted; edit `skills.json` by hand.

On the host, `just clean-stale-all` runs `clean-stale` locally, then inside the devcontainer with its own report and prompt. The devcontainer run starts even when the local run exits 1.
