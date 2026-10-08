# omp agent directory

chezmoi applies this directory to `~/.omp/agent`. This README stays in the repository. See [omp integration](../../docs/agents/omp.md) for discovery and verification details.

## Rules

[`RULES.md.tmpl`](RULES.md.tmpl) joins the top-level `dot_claude/rules/*.md` files into `~/.omp/agent/RULES.md`. It skips `README.md` and files with frontmatter so scoped rules do not become global. omp loads the result as always-apply instructions without an extension or imports in `CLAUDE.md`.

After editing a rule, run `just chezmoi`, then start a fresh omp session or use `/clear` or `/new`.

## Configuration

[`private_config.yml`](private_config.yml) becomes `~/.omp/agent/config.yml` with private permissions.

| Option               | Value                      | Effect                                                      |
| -------------------- | -------------------------- | ----------------------------------------------------------- |
| `modelRoles.default` | `openai-codex/gpt-6.1-sol` | Default chat model.                                         |
| `symbolPreset`       | `nerd`                     | Uses Nerd Font icons; requires a compatible terminal font.  |
| `composer.shape`     | `claude`                   | Claude-style layout for the input editor and status line.   |
| `theme.dark`         | `titanium`                 | Theme for a dark terminal background.                       |
| `theme.light`        | `light`                    | Theme for a light terminal background.                      |
| `setupVersion`       | `2`                        | Internal setup-wizard version, not the omp release version. |
| `dev.autoqaConsent`  | `granted`                  | Grants consent for automatic tool-issue reporting.          |

Edit the source file to retain setting changes across applies; runtime changes are not merged back. Run `just chezmoi` separately on the host and in the devcontainer. These files target the default agent directory, not named profiles or `PI_CODING_AGENT_DIR` overrides.
