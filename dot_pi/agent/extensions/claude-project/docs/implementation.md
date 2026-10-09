# Implementation notes

`projectRoot` detects resource directories under the session working directory. `approvedProjectRoot` retains the approval logic previously held by `claude-commands`. It imports pi's trust store and settings API only when explicit CLI overrides do not decide approval.

The default factory registers one `session_start` handler. It resolves approval once and emits the `claude-project` event with a string directory or `undefined`. All consumer factories subscribe before session events run. The shared event bus avoids module-level caches, which pi's separate jiti instances with `moduleCache: false` do not reliably share.

Consumers must treat `undefined` as no approved project and must not ask for approval themselves. Pi tracks event-bus subscriptions and removes them when the extension runtime is replaced. The coordinator does not supply skills, register commands, or inject rules.
