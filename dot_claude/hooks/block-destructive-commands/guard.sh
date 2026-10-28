#!/bin/sh
# Check the session and git config toggles without consuming the hook payload.
if printf '%s' "${AGENT_HOOKS_DISABLE:-}" | tr ',[:space:]' '\n' | grep -qx 'block-destructive-commands'; then
  exit 0
fi
if [ "$(git config --type=bool --get agent-hook.block-destructive-commands.enabled 2>/dev/null)" = false ]; then
  exit 0
fi
# Keep the original tool payload, dcg output, and exit status.
DCG_NO_SELF_HEAL=1 exec "$HOME/.local/bin/dcg"
