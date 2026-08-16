# cmux notifications for Claude Code

Do not install a `cmux notify` hook by hand. cmux integrates Claude Code automatically, and a manual hook double-notifies.

## The published guide is misleading

[cmux.com/docs/notifications](https://cmux.com/docs/notifications) shows a `~/.claude/hooks/cmux-notify.sh` script plus `Stop` and `PostToolUse` entries in `settings.json`. That page is the generic per-agent recipe. For Claude Code it is redundant, and two things in it are wrong on a real install:

- Its guard is `[ -S /tmp/cmux.sock ]`. cmux keeps its socket at `~/.local/state/cmux/cmux.sock` (path recorded in `/tmp/cmux-last-socket-path`), so the guard never passes and the hook silently no-ops.
- The cmux wrapper merges user hooks by concatenating arrays, so inside cmux the manual `Stop` hook fires alongside cmux's own and you get two notifications per turn.

## How the real integration works

`docs/agent-hooks.md` in the cmux source: "Claude Code is handled by the cmux Claude wrapper when Claude Code integration is enabled in Settings." Every other agent (codex, gemini, cursor, copilot, ...) needs `cmux hooks setup <agent>`; Claude Code does not.

`cmux-claude-wrapper` is a PATH shim. When `claude` is launched from a cmux terminal it injects a hook set through `--settings` covering `SessionStart`, `Stop` (`cmux hooks claude stop` for the notification, plus `hooks feed` and `auto-name`), `SubagentStop`, `SessionEnd`, `Notification`, `UserPromptSubmit`, `PreToolUse`, `PostToolUse:PushNotification`, and `PermissionRequest`. It also sets `preferredNotifChannel: notifications_disabled` so cmux hooks are the only notification source, instead of Claude's raw OSC desktop notification.

Toggle: `automation.claudeCodeIntegration` in `~/.config/cmux/cmux.json`, default `true`. Related: `automation.claudeBinaryPath` if `claude` is not the one on `PATH`.

## When notifications do not fire

Notifications only work for a `claude` process started from a cmux terminal surface. The wrapper passes through untouched outside cmux, and the socket refuses non-cmux processes:

```
Error: ERROR: Access denied - only processes started inside cmux can connect
```

So a session run through the VS Code extension, a bare terminal, or any other host gets no cmux notifications, and no hand-written hook can change that. Launch `claude` from a cmux pane instead.

Check whether the current session is inside cmux:

```bash
env | grep -i cmux   # expect CMUX_SURFACE_ID, CMUX_SOCKET, ...
```

Empty output means the wrapper never ran.

## Related

- cmux source vendored via APM at [apm_modules/manaflow-ai/cmux](../../apm_modules/manaflow-ai/cmux): `docs/agent-hooks.md`, `docs/notifications.md`, `Resources/bin/cmux-claude-wrapper`.
- Bundled skills for cmux itself: `cmux-diagnostics` (health check when hooks or notifications misbehave), `cmux-settings` (`cmux.json` keys), `cmux-customization`.
