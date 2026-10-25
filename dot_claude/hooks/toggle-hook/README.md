# toggle-hook

Adds the `/toggle-hook` command, which turns an advisory hook off or on. Without a flag, the change lasts until you quit the agent. With `--repo`, the change goes in the git config of the session repository, and with `--global` in your global git config. Both last across sessions. Use it when a formatter fights the style of a repo, or when a linter reports on a file that you do not own, and you do not want to restart the agent.

| Agent       | Adapter                                                                                                                                                | Loaded by                                                                                          |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| Claude Code | [`hooks/register.ts`](hooks/register.ts), a mod: `$.command.register` and a `command.run` hook                                                         | `CLAUDE_CODE_PLUGIN_DIRS` in `settings.json.tmpl`                                                  |
| pi and omp  | [`pi.ts`](pi.ts): `registerCommand`, with completion of `--repo`, `--global`, and the hook names                                                       | `extensions` in `dot_pi/agent/modify_settings.json` and `dot_omp/private_agent/private_config.yml` |
| Codex       | None. Codex has no extension commands, so set the variable at launch, `AGENT_HOOKS_DISABLE=lint-prose codex`, or run `git config` in your own terminal | Not applicable                                                                                     |

## What it checks

The hook checks nothing. It runs when you type `/toggle-hook`, and the argument selects the result:

| Argument                          | Result                                                                                       |
| --------------------------------- | -------------------------------------------------------------------------------------------- |
| None, or a flag alone             | Lists the state of each hook and formatter, and the scope that moves it off its default      |
| A hook name                       | Flips that hook until you quit, and prints its new state                                     |
| `all`                             | Turns all 7 hooks off until you quit, or turns all of them on again when one or more are off |
| `--repo` and a hook name          | Flips that hook in the session repository                                                    |
| `--repo` and `<hook>.<formatter>` | Flips one formatter in the session repository, for example `--repo format-code.shfmt`        |
| `--repo all`                      | Turns all 7 hooks off in the session repository, or on again when one or more are off        |
| `--global` and a name, or `all`   | As `--repo`, in the global git config                                                        |
| A guard name                      | Changes nothing, and names the escape hatch of that guard                                    |
| Any other text                    | Changes nothing, and lists the hook names                                                    |

The session can only turn a hook off. A hook that git config turns off stays off when you flip it with no flag: the command then changes nothing and names the flag to use. A formatter name, such as `format-code.shfmt`, works only with `--repo` or `--global`.

### Which hooks have a toggle

Only the advisory hooks have a toggle. An advisory hook formats, lints, or type-checks, and does not exist to stop the model. The 7 advisory hooks are in `HOOKS` in [`core.ts`](core.ts):

- `format-oxfmt`, `format-org-tables`, and `format-code`
- `lint-code` and `lint-prose`
- `type-check-tsc` and `type-check-pyrefly`

`PARTS` in [`core.ts`](core.ts) lists the formatters that have their own key: `terraform`, `shfmt`, and `ruff` of `format-code`.

The guards (`enforce-cli-tools`, `block-commit-attribution`, `block-secret-commits`) exist to stop the model, so they keep their own escape hatches and have no toggle. `track-session-changes` only writes a log.

`format-staged-files`, the git `pre-commit` hook, removes the variable before it runs the formatters, so a commit is formatted also while a formatter is off for the session. The repository setting applies to that hook too: a formatter that is off for the repository does not format the commit.

## Requirements

- **Claude Code:** the mod needs Claude Code 2.1.296 or later, the oldest version tested.
- **pi and omp:** `pi.ts` runs in the runtime of the agent and needs no `node` on `PATH`.
- **git**, for `--repo`, `--global`, and the git config state in the list and the status line.

## How it works

The command has two scopes:

| Scope      | State                                                                                                        | Lasts                     |
| ---------- | ------------------------------------------------------------------------------------------------------------ | ------------------------- |
| Session    | `AGENT_HOOKS_DISABLE`, a list of hook names, separated by spaces or commas, in the process of the agent      | Until you quit the agent  |
| Repository | `agent-hook.<hook>.enabled`, and `agent-hook.<hook>.<formatter>`, in `.git/config` of the session repository | Until you change it again |
| Global     | The same keys in `~/.gitconfig`, or in the file that `GIT_CONFIG_GLOBAL` names                               | Until you change it again |

A repository key wins over a global key. A hook does nothing when a scope turns it off. Each of the 7 hooks reads the variable and the git config on each run. It reads the git config in the repository of each file, with `git config --type=bool --get`, so a session can edit files in more than one repository. A value that is not a boolean, such as `banana`, keeps the hook on.

The session scope changes the variable in the process of the agent itself. Nothing goes to disk, so the change does not reach another session, and chezmoi sees no drift. In Claude Code, `type-check-tsc` and `type-check-pyrefly` are command hooks, which Claude Code starts as a new process: each one gets the variable as Claude Code has it when Claude Code starts the hook.

The repository scope runs `git config --local` in the session folder. To move a key off its default, it writes the value. To move a key back to its default, it removes the key. When a file outside the repository, such as `~/.config/git/config`, still decides, the command writes the value in the repository, which wins.

The global scope reads all global files, and writes `~/.gitconfig`, or the file that `GIT_CONFIG_GLOBAL` names. It never writes `~/.config/git/config`, because chezmoi manages that file. Plain `git config --global` writes there when `~/.gitconfig` does not exist. Git reads `~/.gitconfig` after `~/.config/git/config`, so a value in `~/.gitconfig` wins. A global write cannot win over a repository key: the command then tells you to use `--repo`.

`/clear` in Claude Code and `/new` in pi keep the process, so they also keep the session toggle. Quit the agent to turn all session toggles on again.

## What the model sees

The model sees no output from this hook, because the model cannot run the command. Only you can. Tests on 2026-10-19 with Claude Code 2.1.303, pi 1.3.0, and omp 18.12.2 showed this:

- In Claude Code, the Skill tool refuses the command as a built-in CLI command.
- pi and omp give the model no tool that runs a command.
- The omp `eval` tool can change `process.env` in its own context, but the extensions do not see that change.

A Bash call cannot change the environment of the agent. The model can read the variable, and can set it for one command, but a hook that the agent runs does not see that value.

A Bash call can run `git config`, so the dcg pack [`local.agent_hook`](../../../dot_config/dcg/packs/agent-hook.yaml) blocks an agent command that writes an `agent-hook.*` key. A command that reads a key passes. The pack does not catch a write that does not name the key, such as an edit of `.git/config` or a key in a shell variable. See [`dot_config/dcg/README.md`](../../../dot_config/dcg/README.md#custom-packs).

## What you see

The command prints the state of the hooks, or the new state of one hook:

```
> /toggle-hook
on            format-oxfmt
on            format-org-tables
on            format-code
  on            terraform
  off  repo     shfmt
  on            ruff
on            lint-code
off  session  lint-prose
on            type-check-tsc
on            type-check-pyrefly

> /toggle-hook format-oxfmt
format-oxfmt is off until you quit the agent.

> /toggle-hook --repo format-code.shfmt
format-code.shfmt is on for this repository.

> /toggle-hook --global lint-prose
lint-prose is off in the global git config.
```

While a hook is off, the status line shows `hooks off: <names>`. A name that git config turns off has `(repo)` or `(global)` after it, for example `hooks off: format-code.shfmt (repo), lint-prose`. The status line reads the git config when the session starts and after each command, not when the session folder changes.

## Settings

You can set `AGENT_HOOKS_DISABLE` before you start an agent. This command starts Claude Code with `lint-prose` off, and the status line shows it:

```sh
AGENT_HOOKS_DISABLE=lint-prose claude
```

You can also write the keys yourself, in your own terminal:

```sh
git config agent-hook.lint-prose.enabled false
git config agent-hook.format-code.shfmt false
git config --unset agent-hook.lint-prose.enabled
git config --file ~/.gitconfig agent-hook.format-oxfmt.enabled false
```

In Codex, these are the only ways to turn a hook off.

## Failure behavior

- **The mod throws:** Claude Code skips a hook that throws, so the command does nothing.
- **The engine refuses the write:** for example because of an organization policy. The command prints `Not changed:` and the reason.
- **`--repo` outside a git repository:** `git config --local` fails, and the command prints `Not changed:` and changes nothing.
- **git is not on `PATH`:** the list and the status line show no repository state, and `--repo` prints `Not changed:`.

## Testing

`node test/check.ts` checks the core and both adapters, see [`docs/testing.md`](docs/testing.md).

## Design notes

The mod changes the variable with `$.env.set`, and runs git with `$.process.run`. `pi.ts` changes `process.env`, and runs git with `spawnSync`. The other mods read the variable with `$.env.get`, and the other extensions and `command.ts` read it through `io.ts`. Each hook reads the git config through the process function of its own `Io`. [`docs/hooks/decisions.md`](../../../docs/hooks/decisions.md#advisory-hooks-also-turn-off-per-repository-through-git-config) gives the reasons for the repository scope.

| File                                    | Deployed to `~/.claude/hooks/toggle-hook/` | Role                                                                                                      |
| --------------------------------------- | ------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| `core.ts`                               | Yes                                        | The hook list, the command logic, the git config reads and writes through a git function, the status text |
| `hooks/register.ts`, `hooks/hooks.json` | Yes                                        | Claude Code mod                                                                                           |
| `dot_claude-plugin/plugin.json`         | Yes, as `.claude-plugin/plugin.json`       | Plugin manifest                                                                                           |
| `pi.ts`                                 | Yes                                        | pi and omp extension                                                                                      |
| `README.md`, `docs/`, `test/`           | No                                         | Kept in the repo by `.chezmoiignore`                                                                      |
