# Codex directory

chezmoi renders this directory to `~/.codex`, the user-scope configuration directory of the [Codex CLI](https://developers.openai.com/codex/cli). It gives Codex two parts of the Claude Code configuration, with no change to the Claude Code files: the instructions in `~/.claude/CLAUDE.md` and `~/.claude/rules/`, and the hooks in `~/.claude/hooks/`. [`docs/agents/codex.md`](../docs/agents/codex.md) is the overview of what Codex loads from this repository.

| Path                                               | What lives there                                                                                                             |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| [`AGENTS.md.tmpl`](AGENTS.md.tmpl)                 | Renders `~/.codex/AGENTS.md` from `CLAUDE.md` and every rule in `dot_claude/rules/`.                                         |
| `hooks.json`                                       | The same hook entries as the `hooks` block in [`dot_claude/settings.json`](../dot_claude/settings.json), plus `apply_patch`. |
| [`hooks/apply-patch.sh`](hooks/apply-patch.sh)     | Runs a Claude Code file hook once per file that a Codex `apply_patch` call wrote.                                            |
| [`hooks/test/test.sh`](hooks/test/test.sh)         | Smoke test for the wrapper. Run: `bash hooks/test/test.sh`.                                                                  |
| [`docs/implementation.md`](docs/implementation.md) | Why the template and the wrapper exist, and how each works.                                                                  |

Codex runs a hook only after you trust it. Open the Codex TUI once on the host and once in the devcontainer, and trust the hooks. After a change to a command, matcher, or timeout in `hooks.json`, trust them again. A change to a script needs no new trust.
