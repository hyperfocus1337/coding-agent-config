# Extension manager

`/extensions` opens a selector. Select one extension to toggle its configured state, save settings, and reload Pi. Escape cancels without a change.

```text
/extensions list
/extensions enable task-timer
/extensions disable task-timer
/extensions toggle task-timer
```

Arguments complete extension names to exact paths. Built-in extensions use names such as `builtin:mcp`. If two extensions have the same short name, use the exact path from the list. Paths with spaces do not need quotes: everything after the action is the target.

## Scope and persistence

The manager uses Pi's native discovery for user extensions, trusted project extensions, package extensions, and built-in extensions. It writes to the scope shown beside the resource: user settings in the agent directory, or project settings in `.pi/settings.json`. It does not introduce a second configuration file or change project trust. A user-scope change also affects future sessions in other projects unless project settings override it.

The list reports configured on/off state, not proof that the extension loaded successfully. Missing packages produce warnings and are not installed by this command. Temporary `-e` extensions and SDK-only extensions are outside the settings-based list; CLI overrides can also prevent a settings change from taking effect. Use Pi's startup diagnostics for load failures.

The repository's settings modify script preserves native extension switches and filters on repository-declared packages through chezmoi apply. Other repository-owned settings keep their existing merge behavior.

## Reload and protection

Changes wait for Pi to become idle, save settings, and use the same runtime replacement as `/reload`. This reloads all resources, not only the selected extension. An idempotent enable or disable does not reload; use `/reload` to retry loading an extension that is already configured on.

The manager refuses to disable itself. Disabling a hook under `.claude/hooks/` requires confirmation because it can remove command protection. There is no bulk disable command. Disabling a resource does not remove earlier messages or rules already stored in the conversation, and it does not automatically disable dependent extensions.

Write errors prevent reload. If settings save but reload fails, the command reports that difference and asks you to retry `/reload`. Other running Pi processes do not automatically reload.

These commands require TUI or RPC UI support. Print and JSON modes do not change settings.

## Checks

Run `just pi-check`. See [implementation](docs/implementation.md) for native API dependencies and test limits.
