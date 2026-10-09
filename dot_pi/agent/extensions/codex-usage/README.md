# Codex usage

Publishes ChatGPT plan quota usage for the active `openai` or `openai-codex` provider through `ctx.ui.setStatus`: `codex-session` shows the 5-hour window and `codex-weekly` shows the 7-day window. These are account-wide plan limits, not the new OpenAI app's separate allowance. The `external-status` widgets in [`../pi-footer.json`](../pi-footer.json) display both values beside the context bar. Percentages mean quota used, not quota remaining. Both keys are hidden from the separate extension-status row to prevent duplicates.

## Setup

Keep your current OpenAI model. Run `/login`, select **OpenAI Codex (legacy)**, and sign in with the same ChatGPT account/workspace as your **OpenAI** login. The legacy login is required only to read quota data; you do not need to switch to a legacy model. Run `/reload`, then `/codex-usage`. If the companion login is missing, the footer shows `Session: login required` and `Weekly --`; `/codex-usage` explains how to sign in.

The new OpenAI app token targets `api.openai.com`, while the quota endpoint requires Codex backend authentication. For an active `openai` model, the extension decodes its application ID locally, then reads `https://chatgpt.com/backend-api/wham/usage/chatpass/apps` using only the companion Codex credential. It requires exactly one matching application registration before reading plan quotas from `https://chatgpt.com/backend-api/wham/usage`. This checks that the active registration exists in the quota account; it is not an independent cryptographic identity check. A missing or duplicate match prevents quota display.

For an active `openai-codex` model, only the plan quota request is needed. Both credentials are resolved through `ctx.modelRegistry.getProviderAuth()`, which uses Pi's authentication refresh. The extension does not read credential files, check unrelated providers, send the OpenAI app token to ChatGPT, or make model requests.

## Refresh and failures

Checks run at session start, on model selection, every five minutes, and after an agent run. Automatic checks are limited to one per minute. `/codex-usage` bypasses that interval, but does not start a second request while one is pending. Values can lag account usage by five minutes while idle; this is not a per-token display.

Missing windows, expired windows at refresh time, authentication failures, and endpoint failures display `--`, never a false `0%`. A failed manual check also shows a warning. Providers other than `openai` and `openai-codex` hide both widgets. API-key authentication is not supported; a failed manual check explains this restriction. Polling runs only in TUI mode. Model selection, session shutdown, and reload cancel the old request and timer; a late response cannot restore an old status.

## Implementation and checks

The endpoint is undocumented and can change. Windows are classified by `limit_window_seconds`, not by primary/secondary position, because some plans put a weekly-only window in the primary slot. Only 18,000-second and 604,800-second windows are included. Custom OpenAI and Codex origins and redirects are rejected. Requests have a 10-second timeout and a 64 KiB response limit. Credentials and response bodies are not included in statuses, notifications, or session history.

Run `node test/check.ts` from this directory, or `just pi-check` for the type check and all extension checks. Tests use mocked HTTP responses and cover quota parsing, weekly-only plans, zero usage, expiry, malformed values, response bounds, refresh throttling, manual refresh, custom-origin rejection, model switches, late responses, non-TUI sessions, modern OpenAI companion authentication, missing login, account-registration mismatch, API-key rejection, and footer configuration. They do not make a live account request.
