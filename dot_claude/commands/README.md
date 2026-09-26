---
disable-model-invocation: true
---

# slash commands

Slash commands are prompt templates Claude Code runs when you type `/<namespace>:<name>` (e.g. `/git:changelog`, or `/git:pr:create` for a nested group). Each lives as its own file at `commands/<namespace>/<name>.md`, and the file's frontmatter `description` is what shows in the command picker. They deploy via chezmoi to `~/.claude/commands/`. Each namespace folder has a `README.md` that lists its commands.

## where `$ARGUMENTS` goes

Position the placeholder by what the argument holds, not by a fixed line number.

- A **parameter** is a short value the command consumes: a file path, a commit ref, an issue number, a period keyword, an author string. Put it inline at the point of use, near the top, because the instructions after it refer to it. Some parameters can only sit inline: `issues:improve-issue` substitutes it into a `gh issue view` call, and `git:changelog` tests its value in four conditionals.
- **Content** is a blob the command transforms: prose, code, a transcript. Put it on the last line, alone, after every instruction. A blob has no length limit and can contain text that reads like an instruction, so nothing must follow it. This also keeps the phrase "the prose below" true.

## answer/ — response modes

Seven modes that change how an answer is written, and one command that clears them. See [answer/README.md](answer/README.md).

## ask/ — ask before acting

Two one-shot commands that check the request before the work starts. See [ask/README.md](ask/README.md).

## docs/ — documentation style

Two mode switches that stay on for the session, and six one-shot edits that act on the text pasted after the command. See [docs/README.md](docs/README.md).

## git/ — version control helpers

Eighteen commands for the everyday flow, branch hygiene, and history rewriting. See [git/README.md](git/README.md).

## organize/ — reorder a file into labeled sections

Commands that move content into labeled sections and rewrite nothing unless you allow it. See [organize/README.md](organize/README.md).

## issues/ — GitHub issue workflow

Two commands that rewrite a GitHub issue to be clearer. See [issues/README.md](issues/README.md).

## summarize/ — transcript summaries

One command that summarizes a meeting or transcript. See [summarize/README.md](summarize/README.md).

## chezmoi — dotfile sync

`/chezmoi` is a single command that takes a subcommand, not a namespace.

| Command                    | Description                                                            |
| -------------------------- | ---------------------------------------------------------------------- |
| `/chezmoi diff [path...]`  | Show the diff between the source state and the home directory.         |
| `/chezmoi apply [path...]` | Apply the source state to the home directory, after it shows the diff. |
| `/chezmoi add <path>...`   | Add a file to the source state.                                        |

The command passes `--source <root>` when the working directory is in a git repository whose root holds a `.chezmoi*` or `dot_*` entry. Otherwise it omits `--source`, and chezmoi uses its configured source directory, `~/.local/share/chezmoi` by default. The destination stays at the chezmoi default, `$HOME`. It carries `disable-model-invocation: true`, so it runs only when typed. The apply rule runs `just chezmoi` instead.

## code/ — code utilities

Commands that explain, review, and clean up code. See [code/README.md](code/README.md).

## text/ — text utilities

One command that proofreads text. See [text/README.md](text/README.md).
