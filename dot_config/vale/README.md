# vale

The [Vale](https://vale.sh/) config for the prose linters: the [`lint-prose`](../../dot_claude/hooks/lint-prose/README.md) hook and the [`prose-cleanup`](../../dot_claude/skills/prose-cleanup/SKILL.md) skill. `just chezmoi` deploys it to `~/.config/vale/`, without the READMEs and `docs/`.

| Path                                    | Role                                                               |
| --------------------------------------- | ------------------------------------------------------------------ |
| [`vale.ini`](vale.ini)                  | Applies the `Writing` style to Markdown, Org, HTML, and text files |
| [`styles/`](styles/README.md)           | The rules, and how to add one                                      |
| [`scripts/check.sh`](scripts/README.md) | The one Vale command line that every caller runs                   |
| [`docs/research.md`](docs/research.md)  | Rules that were tested and left out                                |
