---
disable-model-invocation: true
---

# docs slash commands

Two mode switches that stay on for the session, and six one-shot edits that act on the text pasted after the command.

| Command               | Description                                                                                                 |
| --------------------- | ----------------------------------------------------------------------------------------------------------- |
| `/docs:current-state` | Write docs describing only the current state, with no change-history framing.                               |
| `/docs:user-friendly` | Write docs from the reader's point of view, not the implementer's.                                          |
| `/docs:delegate`      | Keep the reader text beside the code, move the mechanism and reasoning to `<notes-file>`, and link the two. |
| `/docs:condense`      | Shorten prose to the fewest sentences that keep every fact a reader acts on.                                |
| `/docs:keybindings`   | Document commands and keybindings as rows in the keybindings table of their section.                        |
| `/docs:annotate`      | Add one or two sentences above a code block or setting that say what it does and why.                       |
| `/docs:paragraphs`    | Split a wall of text into short paragraphs, one idea each, without changing the words.                      |
| `/docs:table`         | Move the parts of prose that compare items on shared attributes into a table, keep the rest as prose.       |

`delegate`, `condense`, `keybindings`, and `annotate` come from one day of prompts against a literate Doom Emacs config: `delegate` and `condense` were asked together every time, `keybindings` covered six requests to add or reshape cheatsheet rows, and `annotate` three requests for a note above a block. `delegate` takes the notes file as its first argument, so the command carries no repo path.
