# lint-prose

Lints the prose in each Markdown, Org, HTML, or plain-text file that a Write or an Edit changed, through [Vale](https://vale.sh/), a prose linter. It gives the alerts to the model, so that the model fixes the text.

One core, [`core.ts`](core.ts), serves four agents through three adapters:

| Agent       | Adapter                                                                                                    | Loaded by                                                                |
| ----------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Claude Code | [`hooks/register.ts`](hooks/register.ts), a mod: `tool.call` on Write and Edit adds `context` after `next` | `CLAUDE_CODE_PLUGIN_DIRS` in `settings.json.tmpl`                        |
| pi          | [`pi.ts`](pi.ts): `tool_result` on write and edit returns `{ content, isError: true }`                     | `extensions` in `dot_pi/agent/modify_settings.json`                      |
| omp         | [`pi.ts`](pi.ts) as in pi, and [`omp.ts`](omp.ts): `tool_result` on an omp edit of more than one file      | `extensions` in `dot_omp/private_agent/private_config.yml`               |
| Codex       | [`command.ts`](command.ts): exit code 2 with the alerts on stderr, exit code 1 with a message for you      | `PostToolUse` on `apply_patch`, through `dot_codex/hooks/apply-patch.ts` |

## What it checks

The hook runs after a Write or an Edit, on the file that the call names. It checks one rule for now: a paragraph, list item, or blockquote has at most 5 sentences, the limit in `writing.md`. [`docs/implementation.md`](docs/implementation.md#rules) tells how to add a rule.

Vale reads only the prose. It skips frontmatter, Org keyword lines, headings, code, `<script>`, and `<pre>`. [`docs/implementation.md`](docs/implementation.md#what-each-format-counts) lists what each format counts.

| Extension         | Vale reads                               |
| ----------------- | ---------------------------------------- |
| `.md` `.markdown` | Paragraphs, list items, blockquotes      |
| `.org`            | Paragraphs, list items, `#+begin_quote`  |
| `.html` `.htm`    | The text inside elements, not the markup |
| `.txt`            | Blocks of text between blank lines       |

The hook skips these calls and files:

- A denied or failed call in Claude Code, pi, and omp, because the call wrote nothing.
- A file under `/tmp`, `/var/tmp`, or `$TMPDIR`.
- A file with an extension that is not in the table above, and a path that is not a file.
- Prose that a Bash command writes. See [Why not Bash](docs/implementation.md#why-not-bash).

## Requirements

The hook needs `vale` on `PATH`. It checks nothing when `vale` is not on `PATH`, or when `vale --version` fails. The second case covers a mise shim with no Vale version set for the current directory.

```sh
brew install vale # macOS
mise use -g vale # Linux, or any system with mise
```

The hook also needs the Vale config in `~/.config/vale/`, which `just chezmoi` deploys. The mod needs Claude Code 2.1.296 or later, the oldest version tested.

`pi.ts`, `command.ts`, and `apply-patch.ts` need Node 23.6 or later, which runs `.ts` files without a flag. The Codex entry starts with `command -v node >/dev/null || exit 0`, so a machine without Node gets no error on each call. The `SessionStart` check then gives a warning, see [A missing `node` gives a warning](../README.md#shared-conventions).

Codex runs a hook only after you trust its entry. After the change from `hook.sh` to `command.ts`, trust the hooks again in the Codex TUI, on the host and in the devcontainer. See [`docs/agents/codex.md`](../../../docs/agents/codex.md#trust).

## How it works

After each Write or Edit, the hook does these steps:

1. It stops when the repository of the file sets `agent-hook.lint-prose.enabled` to `false` in git config. It runs this `git config` only for a prose file that exists outside a temp folder.
2. It runs [`check.sh`](../../../dot_config/vale/scripts/check.sh) on the whole file. `check.sh` runs Vale with the shared [`vale.ini`](../../../dot_config/vale/vale.ini) in `~/.config/vale/`.
3. It keeps only the alerts on the paragraphs that changed.
4. It gives each new alert to the model. It gives an alert that this session already reported to you only.

### The shared Vale config

Because `check.sh` gives Vale the shared config, Vale never reads a repository's own Vale config. `check.sh` is also the scanner behind the `prose-cleanup` skill. To check files yourself, run:

```sh
bash ~/.config/vale/scripts/check.sh README.md docs/*.md
```

### Only the changed paragraphs

A paragraph counts as changed when it holds a line that git reports as changed against `HEAD`. So after an unrelated change, the hook does not report an old long paragraph elsewhere in the file. To find and fix the old alerts that the hook does not report, run `/prose-cleanup`.

When there is nothing to compare against, the hook reports every alert in the file. This occurs in these cases:

- The file is outside git.
- The file is untracked.
- The repository has no commit yet.

### Once per session

Each alert goes to the model once per session. After that, the same rule on the same paragraph text goes to you only, so a later edit to the same file does not report that paragraph again.

An edit that leaves the paragraph too long reports it again. [`docs/implementation.md`](docs/implementation.md#once-per-session) gives the details.

## What the model sees

A Write or an Edit has already run when the hook starts, so the hook cannot undo it. In these docs, the hook _blocks_ when it gives alerts to the model. Each alert is one line: `path:line:column:rule:message`.

Each agent gets the alerts in the way that it allows:

- **Claude Code:** the mod adds the alerts to the `context` of the result, after the line `Prose lint errors in the paragraphs this call changed. Fix them:`.
- **pi and omp:** the extension appends the alerts to the result content, after the line `Prose lint errors:`, and marks the result as an error.
- **Codex:** `command.ts` writes the alerts to stderr and exits 2. A `PostToolUse` hook reaches the model only with exit code 2.

`command.ts` uses these exit codes:

- **0:** no alert, or the hook skipped the file. It prints nothing.
- **1:** a message for you on stderr, or a payload that is not valid JSON. It does not block.
- **2:** the alerts on stderr. They reach the model.

## What you see

Some messages are for you and not for the model, because they are not about text that the model can fix (see [`docs/hooks/decisions.md`](../../../docs/hooks/decisions.md#messages-for-the-user-go-to-a-notification)). The model does not get them:

- `lint-prose: blocked on before in this session, so not again:`, followed by the alerts that this session already reported.
- `lint-prose: Vale failed, so the prose was not checked:`, followed by the output of Vale.
- `lint-prose: <path> is missing, so the prose was not checked.`, when the Vale config is missing. It tells you to run `just chezmoi`.

| Agent       | Where the message goes                                                                                                              |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Claude Code | `$.ui.notify`: a native notification titled `lint-prose`, through your `preferredNotifChannel`. It does not show in the transcript. |
| pi and omp  | `ctx.ui.notify` with the level `warning`, on the screen of the session                                                              |
| Codex       | stderr with exit code 1, which does not block                                                                                       |

## Settings

The hook reads these variables at run time, so export them in your shell, or set them in `env` in `settings.json`:

| Variable              | Effect                                                                                                                               |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `CLAUDE_LINT_DISABLE` | Turns the hook off when its list holds `prose` or `all`. `all` also turns off `lint-code`. Separate the items with spaces or commas. |
| `AGENT_HOOKS_DISABLE` | Turns the hook off when its list holds `lint-prose`. `/toggle-hook` sets it.                                                         |

The hook also reads `git config agent-hook.lint-prose.enabled` in the repository of the file. The value `false` turns the hook off in that repository, across sessions. Outside git, or with a value that is not a boolean, the hook stays on.
| `LINT_PROSE_VALE_DIR` | Replaces `~/.config/vale` as the directory of the config and `scripts/check.sh`. The tests set it to `dot_config/vale`. |

To turn the hook off for all sessions, run:

```sh
export CLAUDE_LINT_DISABLE="prose"
```

To turn the hook off in a running agent, run `/toggle-hook lint-prose`. See [`toggle-hook`](../toggle-hook/README.md).

To turn the hook off in one repository, run `/toggle-hook --repo lint-prose`. In Codex, run `git config agent-hook.lint-prose.enabled false` in your own terminal. The dcg pack `local.agent_hook` blocks an agent command that writes this key.

## Failure behavior

The hook fails open in every agent: a broken lint run never changes the result of the tool call.

| Failure                                            | What happens                                                                      |
| -------------------------------------------------- | --------------------------------------------------------------------------------- |
| `vale` is not on `PATH`, or `vale --version` fails | The hook checks nothing. You see nothing.                                         |
| `~/.config/vale/scripts/check.sh` is missing       | You get a message that names the file. The model gets nothing.                    |
| Vale runs but fails, for example on a broken rule  | You get `lint-prose: Vale failed` and the output of Vale. The model gets nothing. |
| The mod throws                                     | Claude Code skips the mod hook, and the result stands.                            |
| `pi.ts` throws                                     | `pi.ts` catches its own errors, and the result stands.                            |
| `command.ts` gets a bad payload                    | `command.ts` exits 1. Only exit code 2 reaches the model, so the result stands.   |

## Testing

`node test/check.ts` runs the hook with the real Vale and checks the adapters with stubs. [`docs/testing.md`](docs/testing.md) tells what it checks and what it needs.
