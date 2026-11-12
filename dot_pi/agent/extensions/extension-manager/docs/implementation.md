# Implementation

The extension registers `/extensions` and no model-callable tools. It uses `SettingsManager` for trusted reads, locked writes, error reporting, and flush completion. It uses `DefaultPackageManager.resolve()` to discover resources without executing their factories. Missing package sources are skipped rather than installed.

Pi does not export the package-manager constructor or its built-in extension list from the public package entry point. The manager imports `dist/core/package-manager.js` and `dist/extensions/index.js` from `getPackageDir()`. The installed-loader test checks both dependencies. Replace these imports if Pi adds a public resource-discovery API.

## Native settings

Top-level resources retain plain declarations and get an exact absolute `+path` or `-path` entry. Keeping declarations lets Pi find disabled files outside its automatic search directories. Built-ins use `+builtin:name` and `-builtin:name`.

Package resources get an exact package-relative filter in their owning package entry. Existing skill, prompt, and theme filters remain unchanged. When enabling one resource from an empty extension filter, `!**` preserves the disabled sibling resources before `+path` enables the target.

The manager uses the resolved resource's scope, including existing project overrides. It does not create scope overrides on demand. Use `pi config` to manage inheritance or choose a different scope.

A command refreshes discovery before acting and reloads settings again before writing. Argument completion uses the most recent discovery result. The configured state is not runtime load status: there is no public registry of all loaded, failed, replaced, and temporary extensions available through `ExtensionAPI`.

## Persistence through chezmoi

`dot_pi/agent/modify_settings.json` appends current native extension switches after repository declarations. It preserves switch order because the last matching override can determine the state. For repository-declared package sources, it retains the current object declaration, including resource filters. It does not retain unrelated package declarations or plain extension declarations. Malformed JSON fails instead of replacing the current settings with defaults.

## Tests

`test/check.ts` uses temporary agent and project directories, the installed Pi loader, resolver, and settings manager. It checks command validation, completion, ambiguous names, selector cancellation, user/project scope, untrusted projects, built-ins, package filters, sibling isolation, manager self-protection, hook confirmation, malformed settings, reload failure reporting, and chezmoi persistence and idempotence. Native loading verifies that disabling removes an extension's registered commands.

The command context's reload method is mocked. The test does not run an interactive terminal or prove third-party shutdown cleanup. Pi owns runtime replacement; extension-specific shutdown behavior remains covered by each extension's checks.
