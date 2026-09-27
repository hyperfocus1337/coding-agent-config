# lint-prose

A `PostToolUse` and `PostToolUseFailure` hook that lints the prose in each Markdown, Org, or HTML file Claude writes, through [Vale](https://vale.sh/). It blocks the tool result on an alert, so Claude sees it and fixes the text.

## What it checks

One rule for now: a paragraph, list item, or blockquote has at most 6 sentences, the limit in `writing.md`. Vale reads only the prose: it skips frontmatter, Org keyword lines, headings, code, `<script>`, and `<pre>`. [`docs/implementation.md`](docs/implementation.md) lists what each format counts, and how to add a rule.

| Extension         | Vale reads                               |
| ----------------- | ---------------------------------------- |
| `.md` `.markdown` | Paragraphs, list items, blockquotes      |
| `.org`            | Paragraphs, list items, `#+begin_quote`  |
| `.html` `.htm`    | The text inside elements, not the markup |

## How it works

Wired to four entries in `settings.json`: `Write|Edit|MultiEdit` and `Bash` on `PostToolUse`, and `Bash` again on `PostToolUseFailure`. It finds the files the same way [`lint-all-languages`](../lint-all-languages/README.md#bash-the-paths-the-command-just-wrote) does: the named file on `Write` and `Edit`, and on Bash the paths in the command text that the command just wrote. Files under `/tmp`, `/var/tmp`, and `$TMPDIR` are skipped.

A `Write` or a Bash command checks the whole file. An `Edit` checks only the text it wrote, so an old long paragraph elsewhere in the file does not block an unrelated edit.

[`check.sh`](check.sh) runs Vale with the bundled [`vale/vale.ini`](vale/vale.ini), so a repository's own Vale config is never read. It is also the scanner behind `/docs:paragraphs`:

```sh
bash ~/.claude/hooks/lint-prose/check.sh README.md docs/*.md
```

## Turning it off

Set `CLAUDE_LINT_DISABLE` to a list that holds `prose`, or `all`. `all` also turns off `lint-all-languages`.

```sh
export CLAUDE_LINT_DISABLE="prose"
```

## Installing Vale

The hook exits 0 and checks nothing when `vale` is not on `PATH`.

```sh
brew install vale     # macOS
mise use -g vale      # Linux, or any system with mise
```

## Testing

`bash test/test.sh` covers the rule in each format, the `Edit`-only check, the Bash matcher, and the skips. It needs `jq` and `vale`.
