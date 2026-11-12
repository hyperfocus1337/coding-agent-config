# Public extensions

[Agent directory](../README.md)

The `packages` array in [`modify_settings.json`](../modify_settings.json) selects these public pi extension packages. The `extensions` array in the same file selects local Claude hook adapters, not public packages. Repository-owned extensions are listed in [`extensions/README.md`](../extensions/README.md).

| Package entry                            | Purpose                                            | Main interface                        |
| ---------------------------------------- | -------------------------------------------------- | ------------------------------------- |
| `npm:pi-web-access`                      | Web search, page retrieval, and source checks.     | Model tools and `/websearch`.         |
| `npm:pi-footer`                          | Configurable multi-line status footer.             | `/footer`.                            |
| `npm:pi-context-view`                    | Context usage and injected instruction inspection. | `/context`.                           |
| `npm:@juicesharp/rpiv-ask-user-question` | Structured questions with selectable answers.      | The model's `ask_user_question` tool. |

## Web access

[`pi-web-access`](https://www.npmjs.com/package/pi-web-access) gives the model tools to search and read external sources:

- `web_search`: search for sources.
- `fetch_content`: retrieve page content, GitHub repositories, and supported video content.
- `get_search_content`: read or search stored results.
- `source_check`: gather source passages for a claim.

Use `/websearch` to open the interactive search interface. Search providers can use their own credentials or supported pi logins; the package also supports keyless Exa MCP search.

[`modify_web-search.json`](../modify_web-search.json) manages the page-fetch route in `~/.pi/agent/web-search.json`: direct HTTP, then Jina, then Parallel MCP. It enables remote hosted fetch providers and preserves other local settings and credentials. This route governs page retrieval, not search-provider selection. Hosted fallbacks can receive the target URL, so do not use them for sensitive URLs without checking the provider's data policy.

## Footer

[`pi-footer`](https://github.com/wobondar/pi-footer) displays working directory, Git state, model, context usage, and values supplied by other extensions.

Use `/footer` to edit the layout. This repository tracks the configuration in [`extensions/pi-footer.json`](../extensions/pi-footer.json), installed at `~/.pi/agent/extensions/pi-footer.json`. Save live edits back to that source file to retain them across chezmoi applies.

The local `codex-usage` extension supplies the quota widgets; it is not part of the public package. See [footer and context usage](footer-and-context.md) for the configured rows, quota login requirements, and font requirements.

## Context viewer

[`pi-context-view`](https://github.com/dimk90/pi-context-view) shows estimated context usage and the instructions included in the latest request.

| Command                        | Purpose                                                                   |
| ------------------------------ | ------------------------------------------------------------------------- |
| `/context` or `/context usage` | Show context usage by category.                                           |
| `/context injections`          | Inspect the system prompt, tool definitions, and extension contributions. |
| `/context config`              | Create the user configuration file with defaults.                         |

The default configuration path is `~/.pi/agent/extensions/pi-context-view.json`. The viewer adds no instructions to model context. See [context inspection](footer-and-context.md#inspect-context) for how Claude rules appear.

## Structured questions

[`@juicesharp/rpiv-ask-user-question`](https://github.com/juicesharp/rpiv-mono/tree/main/packages/rpiv-ask-user-question) gives the model the `ask_user_question` tool. It can ask up to four questions, each with two to four options, and return the answers as structured data. Questions can allow multiple selections, and single-select options can include Markdown previews.

Use the arrow keys and Enter to choose, Tab to move between questions, or the appended `Type something.` row to write an answer. Escape cancels the questionnaire. In the terminal, `n` adds notes and `Ctrl+]` collapses or expands the dialog.

Optional settings are read from `~/.config/rpiv-ask-user-question/config.json`. No API key is required, and the extension makes no model calls of its own. In non-interactive runs, it removes its tool rather than opening a dialog.

## Maintenance

Keep the package list in `modify_settings.json`; an apply replaces the installed settings array with the repository's array. `just pi-update` updates the configured packages and then refreshes model catalogs. It does not update pi itself. These entries have no version pins, so package updates can change commands and behavior.

This page describes the configured packages using their installed READMEs. Use the upstream links for the full provider, configuration, and keyboard references.
