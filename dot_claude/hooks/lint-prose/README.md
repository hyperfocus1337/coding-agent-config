# lint-prose

Lints the prose in each Markdown, Org, HTML, or plain-text file that a Write or an Edit changed, through [Vale](https://vale.sh/), and gives the alerts to the model, so it fixes the text.

One core, [`core.ts`](core.ts), serves four agents through three adapters:

| Agent       | Adapter                                                                                                    | Loaded by                                                                                          |
| ----------- | ---------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Claude Code | [`hooks/register.ts`](hooks/register.ts), a mod: `tool.call` on Write and Edit adds `context` after `next` | `CLAUDE_CODE_PLUGIN_DIRS` in `settings.json.tmpl`                                                  |
| pi and omp  | [`pi.ts`](pi.ts): `tool_result` on write and edit returns `{ content, isError: true }`                     | `extensions` in `dot_pi/agent/modify_settings.json` and `dot_omp/private_agent/private_config.yml` |
| Codex       | [`command.ts`](command.ts): exit code 2 with the alerts on stderr, exit code 1 with a message for you      | `PostToolUse` on `apply_patch`, through `dot_codex/hooks/apply-patch.ts`                           |

## What it checks

One rule for now: a paragraph, list item, or blockquote has at most 5 sentences, the limit in `writing.md`. Vale reads only the prose: it skips frontmatter, Org keyword lines, headings, code, `<script>`, and `<pre>`. [`docs/implementation.md`](docs/implementation.md) lists what each format counts, and how to add a rule.

| Extension         | Vale reads                               |
| ----------------- | ---------------------------------------- |
| `.md` `.markdown` | Paragraphs, list items, blockquotes      |
| `.org`            | Paragraphs, list items, `#+begin_quote`  |
| `.html` `.htm`    | The text inside elements, not the markup |
| `.txt`            | Blocks of text between blank lines       |

## How it works

The hook checks the file that the Write or Edit names. It skips a failed call, because a failed call wrote nothing, and files under `/tmp`, `/var/tmp`, and `$TMPDIR`. Prose that a Bash command writes is not checked, see [Why not Bash](docs/implementation.md#why-not-bash).

The hook checks the whole file, then reports only the alerts on paragraphs that hold a line git reports as changed against `HEAD`. When there is nothing to compare against, the hook reports every alert in the file: this occurs outside git, for an untracked file, and in the first commit. In all other cases, an old long paragraph elsewhere in the file does not block an unrelated change.

Each alert goes to the model once per session. After that, the same rule on the same paragraph text goes to you only, so a later edit to the same file does not report that paragraph again. An edit that leaves the paragraph too long reports it again. [`docs/implementation.md`](docs/implementation.md#once-per-session) gives the details.

The hook runs [`check.sh`](../../../dot_config/vale/scripts/check.sh), which runs Vale with the shared [`vale.ini`](../../../dot_config/vale/vale.ini) in `~/.config/vale/`. Because of this, Vale never reads a repository's own Vale config. `check.sh` is also the scanner behind the `prose-cleanup` skill:

```sh
bash ~/.config/vale/scripts/check.sh README.md docs/*.md
```

`LINT_PROSE_VALE_DIR` replaces `~/.config/vale` as the directory of the config and `scripts/check.sh`. The tests set it to `dot_config/vale` in the chezmoi source.

## How the model sees the alerts

A Write or an Edit has already run when the hook starts, so the hook cannot undo it. It gives the alerts to the model in the way each agent allows:

- **Claude Code:** the mod adds the alerts to the `context` of the result.
- **pi and omp:** the extension appends the alerts to the result content and marks the result as an error.
- **Codex:** `command.ts` exits 2. A `PostToolUse` hook reaches the model only with exit code 2.

## Messages for you

Some messages are for you and not for the model: alerts that this session already reported, a Vale failure, and a missing Vale config. The model does not get them, because they are not about text that it can fix (decision D2 in [`docs/hooks-design.md`](../../../docs/hooks-design.md#decisions)):

| Agent       | Where the message goes                                                                                                              |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Claude Code | `$.ui.notify`: a native notification titled `lint-prose`, through your `preferredNotifChannel`. It does not show in the transcript. |
| pi and omp  | `ctx.ui.notify` with the level `warning`, on the screen of the session                                                              |
| Codex       | stderr with exit code 1, which does not block                                                                                       |

## Settings

`CLAUDE_LINT_DISABLE` turns the hook off when its list holds `prose` or `all`. `all` also turns off `lint-all-languages`. The hook reads it at run time, so export it in your shell, or set it in `env` in `settings.json`.

```sh
export CLAUDE_LINT_DISABLE="prose"
```

To find and fix the old alerts that the hook does not report, run `/prose-cleanup`.

## Failure behavior

The hook fails open in every agent, so a broken lint run never changes the result:

- Claude Code skips a mod hook that throws, and the result stands.
- `pi.ts` catches its own errors.
- `command.ts` exits 1 on a bad payload. Only exit code 2 reaches the model.

When Vale runs but fails, for example on a broken rule, the hook sends `lint-prose: Vale failed` to you and does not report to the model.

## Dependencies

The hook checks nothing when `vale` is not on `PATH`, or when `vale --version` fails. The second case covers a mise shim with no Vale version set for the current directory.

```sh
brew install vale # macOS
mise use -g vale # Linux, or any system with mise
```

The mod needs Claude Code 2.1.296 or later, the oldest version tested. `pi.ts`, `command.ts`, and `apply-patch.ts` need Node 23.6 or later, which runs `.ts` files without a flag. The Codex entry starts with `command -v node || exit 0`, so a machine without Node is not blocked. The `SessionStart` check then gives a warning, see [A missing `node` gives a warning](../README.md#shared-conventions).

Codex runs a hook only after you trust its entry. After the change from `hook.sh` to `command.ts`, trust the hooks again in the Codex TUI, on the host and in the devcontainer. See [`docs/agents/codex.md`](../../../docs/agents/codex.md#trust).

## Tests

`node test/check.ts` runs `command.ts` with the real Vale on the rule in each format, a Bash payload, the changed-paragraph filter in a git repository, the once-per-session record, a Vale failure, and the skips. It also checks the pi and mod adapters with stubs over the real files. It needs `vale` and `git`. `just hooks-check` runs it.

## Files

| File                                    | Deployed to `~/.claude/hooks/lint-prose/` | Role                                                               |
| --------------------------------------- | ----------------------------------------- | ------------------------------------------------------------------ |
| `core.ts`                               | Yes                                       | Runs Vale, keeps the changed paragraphs, and keeps the record      |
| `hooks/register.ts`, `hooks/hooks.json` | Yes                                       | Claude Code mod                                                    |
| `dot_claude-plugin/plugin.json`         | Yes, as `.claude-plugin/plugin.json`      | Plugin manifest                                                    |
| `pi.ts`                                 | Yes                                       | pi and omp extension                                               |
| `command.ts`                            | Yes                                       | Codex command hook                                                 |
| `io.ts`                                 | Yes                                       | The `Io` and the settings under Node, for `pi.ts` and `command.ts` |
| `README.md`, `docs/`, `test/`           | No                                        | Kept in the repo by `.chezmoiignore`                               |
