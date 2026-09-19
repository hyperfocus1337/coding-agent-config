# pi extensions

Extensions are TypeScript modules pi loads at startup, through jiti, with no build step. Each extension is one directory here holding `index.ts`, a README for the person using it, `docs/implementation.md` for the person changing it, and `test/check.ts`. chezmoi renders this directory to `~/.pi/agent/extensions/`, a path pi scans on its own, so `settings.json` does not name it. The `.md` files stay in the repository: `.chezmoiignore` keeps them out of `$HOME`.

| Extension                                      | Reads                | Summary                                                                                                                                                         |
| ---------------------------------------------- | -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`claude-commands`](claude-commands/README.md) | `~/.claude/commands` | Registers every command file as a slash command named by its path, `/git:commit:single`, and expands arguments and `` !`cmd` `` spans the way Claude Code does. |
| [`claude-rules`](claude-rules/README.md)       | `~/.claude/rules`    | Puts unscoped rules in the system prompt and sends a rule with `paths:` once per session after a file tool touches a matching file.                             |
| [`compact-bash`](compact-bash/README.md)       | pi's own `bash` tool | Replaces the five-line output preview under a `bash` call with one line, `42 lines`. `ctrl+o`, and a command that fails, keep pi's own output.                  |

The first two, together with the `skills` setting and the `AGENTS.md` symlink documented in [`../README.md`](../README.md), make pi read the user-scope configuration in [`dot_claude/`](../../../dot_claude/README.md), so one copy serves both agents. [`docs/agents/pi.md`](../../../docs/agents/pi.md) is the overview. `compact-bash` changes pi's own display and carries no Claude Code behaviour.

## Shared conventions

**The behaviour it replaces is the contract.** `claude-commands` and `claude-rules` each reproduce a documented Claude Code behaviour; `compact-bash` replaces one pi renderer and keeps the rest of the tool. Each README names what it does not carry over and why, and the header comment of `index.ts` states the same list in short form.

**User scope only.** No extension reads a project's `.claude/` or `.pi/`. This repository holds user scope only, and project scope is what most of the complexity in a full port (trust gates, settings chains) exists for.

**No dependency.** Frontmatter parsing, glob matching, and argument splitting use the standard library. `claude-rules` imports `parseFile` from `claude-commands`, so the two share one frontmatter parser.

**One runnable check per extension.** `test/check.ts` holds assert-based checks that plain `node` runs, with no test framework. The last group of each runs against what is installed, `~/.claude` or the pi package, so a command, a rule, or a pi internal that drifts fails there first. `node` cannot import pi's package from this repository, so an extension that imports it keeps the logic its check covers in a module of its own, the way `compact-bash` keeps `summary.ts`.

## Checks

```
just pi-check
```

runs [`scripts/extensions/pi/check.sh`](../../../scripts/extensions/pi/check.sh): `tsc --strict` over every `*/index.ts` against the types of the installed pi package and of `pi-tui` beside it, then every `*/test/check.ts` with `node`, with `PI_PACKAGE` set to the installed package. The script finds that package from the resolved `pi` binary and from the global install roots; `PI_PACKAGE=<directory that holds dist/index.d.ts>` skips the search. Run it after an edit here and after `just chezmoi`. `/reload` in a running pi picks up an edit; `pi -p "hi" </dev/null` starts a headless session for a probe extension, and stdin must be closed or `session_start` never fires.

## Adding an extension

Create `<name>/index.ts` exporting a default function that takes the `ExtensionAPI`, add `<name>/README.md` and `<name>/test/check.ts`, and add a row to the table above. `check.sh` picks up both files by glob.
