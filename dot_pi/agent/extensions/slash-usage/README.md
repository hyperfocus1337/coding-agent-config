# Slash usage

Type `/` to show your most-used slash commands first. A higher submission count comes first; the most recent use breaks a tie. Commands with no history keep Pi's original order. History starts when this extension is installed, not from past Claude Code or Pi sessions.

Typing more characters, such as `/git`, keeps Pi's normal matching and ordering. Command arguments and file completion do not change. This also works with the whitespace and multiline slash completion supplied by `claude-commands`.

## Storage

History lives in `~/.pi/agent/data/slash-usage.jsonl`, or the equivalent path under `PI_CODING_AGENT_DIR`. Each record holds a command name and a timestamp. Arguments and prompt text are not stored. The file is runtime data, not part of the chezmoi source state. Host and devcontainer histories are separate.

Each submitted leading slash command counts once, including a command that fails or is unknown. Unknown commands cannot appear in the menu unless they are later registered. Inline mentions do not count. There are no model calls or network requests.

History is append-only so concurrent Pi sessions do not overwrite each other's counts. The bare menu reads the latest history, including submissions from another session. A missing file means empty history; malformed records are skipped. A storage error shows one warning per session and does not stop command execution.

## Loading

The extension loads automatically from this directory after chezmoi apply. Use `/reload` in a running Pi session. It wraps the editor factory already installed by `claude-commands`, rather than replacing that editor's behavior. An extension that replaces the editor later can remove submission tracking.

See [implementation](docs/implementation.md) for the integration points and checks.
