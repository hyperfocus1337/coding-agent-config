# Hooks

Each hook in [`dot_claude/hooks/`](../../dot_claude/hooks/README.md) has one TypeScript core, `core.ts`, that 4 agents share through 3 adapters. A hook with code for omp only also has an `omp.ts`, see [omp code](authoring.md#omp-code). The hook README lists the hooks and the contracts they keep. These documents give the design behind them.

| Agent       | Adapter             | Runs as                        | Loaded by                                                    |
| ----------- | ------------------- | ------------------------------ | ------------------------------------------------------------ |
| Claude Code | `hooks/register.ts` | A mod, in process              | `CLAUDE_CODE_PLUGIN_DIRS` in `dot_claude/settings.json.tmpl` |
| pi          | `pi.ts`             | An extension, in process       | `extensions` in `dot_pi/agent/modify_settings.json`          |
| omp         | `pi.ts`, `omp.ts`   | An extension, in process       | `extensions` in `dot_omp/private_agent/private_config.yml`   |
| Codex       | `command.ts`        | A command hook, one Node start | `dot_codex/modify_hooks.json`                                |

Three hooks also run `command.ts` in Claude Code, as a command hook in `settings.json.tmpl`: `block-secret-commits`, `type-check-tsc`, and `type-check-pyrefly`. The mod API cannot do what they need, see [`decisions.md`](decisions.md). `format-staged-files` is not an agent hook. It is a git `pre-commit` hook in [`dot_config/git/hooks/`](../../dot_config/git/hooks/format-staged-files/README.md) that runs the `command.ts` of the two formatter hooks.

| File                           | Read it when                                         |
| ------------------------------ | ---------------------------------------------------- |
| [`authoring.md`](authoring.md) | You add a hook or change an adapter                  |
| [`platforms.md`](platforms.md) | You must know if an agent's hook API can do a thing  |
| [`decisions.md`](decisions.md) | You want to change the design, and must know the why |
| [`gaps.md`](gaps.md)           | You must know what a hook does not cover yet         |

Related research:

- [`research/hooks/event-scoping.md`](../research/hooks/event-scoping.md): which event each format, lint, and type-check hook uses.
- [`research/hooks/hook-scoping.md`](../research/hooks/hook-scoping.md): whether each hook attaches to the right event and tool names in Claude Code, pi, omp, and Codex.
- [`agents/codex.md`](../agents/codex.md#hooks): how Codex runs the hooks, `apply-patch.ts`, and hook trust.
