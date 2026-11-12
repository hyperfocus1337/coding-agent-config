# Footer and context usage

[Agent directory](../README.md)

## Footer layout

[`pi-footer`](https://github.com/wobondar/pi-footer) uses [`extensions/pi-footer.json`](../extensions/pi-footer.json) for three gray powerline rows: working directory/branch/diff totals, origin remote URL/model, and context bar with used/max tokens and percentage. Home paths use `~`. The built-in widgets do not show the remote as `owner/repo`. Use a Powerline-compatible font for the separators.

## Codex quotas

The local [`codex-usage`](../extensions/codex-usage/README.md) extension supplies ChatGPT plan session (5-hour) and weekly quota-used percentages through two `external-status` widgets beside the context bar for `openai` and `openai-codex` models. It uses Pi's companion **OpenAI Codex** login for quota reads and verifies the active OpenAI app registration before displaying plan limits; `/codex-usage` refreshes the values. Keep the current OpenAI model and use the same account/workspace for both logins. Other providers hide these widgets.

## Save footer changes

Run `/footer` to edit the live layout. Save a change back to this repository if you want it to survive the next chezmoi apply, which restores the tracked configuration. The settings merge removes the retired `powerline` key and replaces the package list, so the old footer is not loaded.

## Inspect context

[`pi-context-view`](https://github.com/dimk90/pi-context-view) keeps its on-demand visualization. Run `/context` for the estimated context breakdown or `/context injections` to inspect the system prompt, tool definitions, and extension instructions. It adds no instructions to model context. Unscoped Claude rules use native instruction-file records, so each rule appears under Instruction Files. Path-scoped rules remain conditional messages.
