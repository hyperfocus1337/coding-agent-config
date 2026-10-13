# lint-prose

A `PostToolUse` hook that lints the prose in each Markdown, Org, HTML, or plain-text file Claude writes with `Write`, `Edit`, or `MultiEdit`, through [Vale](https://vale.sh/). It blocks the tool result on an alert, so Claude sees it and fixes the text.

## What it checks

One rule for now: a paragraph, list item, or blockquote has at most 5 sentences, the limit in `writing.md`. Vale reads only the prose: it skips frontmatter, Org keyword lines, headings, code, `<script>`, and `<pre>`. [`docs/implementation.md`](docs/implementation.md) lists what each format counts, and how to add a rule.

| Extension         | Vale reads                               |
| ----------------- | ---------------------------------------- |
| `.md` `.markdown` | Paragraphs, list items, blockquotes      |
| `.org`            | Paragraphs, list items, `#+begin_quote`  |
| `.html` `.htm`    | The text inside elements, not the markup |
| `.txt`            | Blocks of text between blank lines       |

## How it works

Wired to one entry in `settings.json`: `Write|Edit|MultiEdit` on `PostToolUse`. The hook checks the file that the payload names. Files under `/tmp`, `/var/tmp`, and `$TMPDIR` are skipped. Prose that a Bash command writes is not checked, see [Why not Bash](docs/implementation.md#why-not-bash).

The hook checks the whole file, then reports only the alerts on paragraphs that hold a line git reports as changed against `HEAD`. When there is nothing to compare against, the hook reports every alert in the file: this occurs outside git, for an untracked file, and in the first commit. In all other cases, an old long paragraph elsewhere in the file does not block an unrelated change.

Each alert blocks once per session. After that, the same rule on the same paragraph text goes to you with exit 1, so a later edit to the same file does not block again on that paragraph. An edit that leaves the paragraph too long blocks again. [`docs/implementation.md`](docs/implementation.md#once-per-session) gives the details.

The hook runs [`check.sh`](../../../dot_config/vale/scripts/check.sh), which runs Vale with the shared [`vale.ini`](../../../dot_config/vale/vale.ini) in `~/.config/vale/`. Because of this, Vale never reads a repository's own Vale config. `check.sh` is also the scanner behind the `prose-cleanup` skill:

```sh
bash ~/.config/vale/scripts/check.sh README.md docs/*.md
```

`LINT_PROSE_VALE_DIR` replaces `~/.config/vale` as the directory of the config and `scripts/check.sh`. The tests set it to `dot_config/vale` in the chezmoi source.

## Settings

`CLAUDE_LINT_DISABLE` turns the hook off when its list holds `prose` or `all`. `all` also turns off `lint-all-languages`. The hook reads it at run time, so export it in your shell, or set it in `env` in `settings.json`.

```sh
export CLAUDE_LINT_DISABLE="prose"
```

To find and fix the old alerts that the hook does not report, run `/prose-cleanup`.

## Installing Vale

The hook exits 0 and checks nothing when `vale` is not on `PATH`, or when `vale --version` fails. The second case covers a mise shim with no Vale version set for the current directory. When Vale runs but fails, for example on a broken rule, the hook shows `lint-prose: Vale failed` to you and does not block Claude.

```sh
brew install vale # macOS
mise use -g vale # Linux, or any system with mise
```

## Testing

`bash test/test.sh` covers the rule in each format, a Bash payload, the changed-paragraph filter in a git repository, the once-per-session record, a Vale failure, and the skips. It needs `jq` and `vale`.
