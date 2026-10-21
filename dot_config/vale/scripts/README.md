# scripts

[`check.sh`](check.sh) is the one Vale command line for the prose linters: the `lint-prose` hook, the `prose-cleanup` skill, and a future pi hook. Each caller runs it, so a change to the command line goes into one file.

It does four things that a plain `vale FILE...` call does not:

- **Isolation:** it runs Vale with `--no-global --config ../vale.ini`, so a repository's own `.vale.ini` and the user's global Vale config are never read.
- **Frontmatter:** Vale stops with an error on frontmatter that is not valid YAML, such as `argument-hint: [a | b]`. The script blanks the frontmatter lines and sends the file on stdin, so the line numbers stay correct. See [Frontmatter](../../../dot_claude/hooks/lint-prose/docs/implementation.md#frontmatter).
- **Other config:** the `prose-cleanup` skill sets `PROSE_VALE_CONFIG` to lint with another Vale config, such as one that loads a Vale package. The hook never sets it, so it always uses `../vale.ini`.
- **Exit code:** it runs Vale once for each file and exits with the highest code: 0 when there is no alert, 1 on an alert, and 2 when Vale fails. A caller can then tell bad prose from a broken rule.

```sh
bash ~/.config/vale/scripts/check.sh README.md docs/*.md
```
