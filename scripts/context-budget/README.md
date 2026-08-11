# Context budget measurement

`measure-context.py` reports what this machine's Claude Code config costs at session start. It walks `~/.claude` plus every installed plugin, reconstructs the skill, command and agent listings Claude actually receives, and prints characters and a rough token estimate per source, split into enabled and disabled.

```
python3 scripts/context-budget/measure-context.py
```

No arguments, no dependencies, read-only. It also warns about plugins set to `true` in `enabledPlugins` that are not present in `installed_plugins.json`.

Findings, gating rules, the costs the script cannot see (built-in skills, `SessionStart` hook injections), and what to do about them: [`docs/research/skills-context.md`](../../docs/research/skills-context.md).
