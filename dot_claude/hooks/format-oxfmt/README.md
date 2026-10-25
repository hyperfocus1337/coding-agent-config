# format-oxfmt

Formats the files that a Write, an Edit, or a Bash call changed with [oxfmt](https://oxc.rs/docs/guide/usage/formatter), in place of [`format-prettier`](../format-prettier/README.md). The hook is off by default. When git config turns it on, `format-prettier` leaves the same files alone, so the two formatters never both format one file.

The hook can replace `format-prettier` later. Until then, you can switch between the two hooks with one git config key. The research for this hook is in [`oxfmt-and-prettier-alternatives.md`](../../../docs/research/formatting/oxfmt-and-prettier-alternatives.md).

| Agent       | Adapter                                                                                                                    | Loaded by                                                                            |
| ----------- | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Claude Code | [`hooks/register.ts`](hooks/register.ts), a mod: `tool.call` on Write, Edit, and Bash formats after `next`                 | `CLAUDE_CODE_PLUGIN_DIRS` in `settings.json.tmpl`                                    |
| pi          | [`pi.ts`](pi.ts): `tool_result` on write, edit, and bash                                                                   | `extensions` in `dot_pi/agent/modify_settings.json`                                  |
| omp         | [`pi.ts`](pi.ts) as in pi, and [`omp.ts`](omp.ts) for the omp calls that `pi.ts` does not see                              | `extensions` in `dot_omp/private_agent/private_config.yml`                           |
| Codex       | [`command.ts`](command.ts), a command hook: the amend hint as `hookSpecificOutput` JSON on stdout                          | `PostToolUse` on Bash, and on `apply_patch` through `dot_codex/hooks/apply-patch.ts` |
| git         | [`format-staged-files`](../../../dot_config/git/hooks/format-staged-files/README.md) runs `command.ts` on the staged files | `~/.config/git/config`                                                               |

## The switch

One key decides which hook formats: `agent-hook.format-oxfmt.enabled`.

| Key value                  | Hook that formats                                               |
| -------------------------- | --------------------------------------------------------------- |
| unset, `false`, or no bool | `format-prettier`                                               |
| `true`                     | `format-oxfmt`, unless `AGENT_HOOKS_DISABLE` names format-oxfmt |

- **Everywhere:** `/toggle-hook --global format-oxfmt` turns oxfmt on or off.
- **One repository:** `/toggle-hook --repo format-oxfmt` turns oxfmt on or off. A repository key wins over the global key.
- **Until you quit the agent:** `/toggle-hook format-oxfmt` gives the files back to Prettier.
- **Codex:** it has no extension commands, so run `git config --global agent-hook.format-oxfmt.enabled true` in your own terminal.

The dcg pack `local.agent_hook` blocks an agent command that writes the key.

Both hooks read the key in the session folder, once for each call: `$.session.cwd()` in the mod, `ctx.cwd` in pi, and the payload `cwd` in `command.ts` and `format-staged-files`. So the hook that does not format starts one `git config` run and no sweep. The limit: a file in a different repository, reached by an absolute path in a Bash command, follows the switch of the session folder, not the switch of its own repository.

## What it formats

After a Write or an Edit, the hook formats the file by its extension:

| Extensions                                                   | Note                                                        |
| ------------------------------------------------------------ | ----------------------------------------------------------- |
| `.md`, `.markdown`                                           | Native Markdown formatter since oxfmt 0.72.0                |
| `.js`, `.jsx`, `.ts`, `.tsx`, `.mts`, `.cts`, `.mjs`, `.cjs` |                                                             |
| `.json`, `.jsonc`, `.json5`                                  | `.jsonc` and `.json5` are not in `format-prettier`          |
| `.css`, `.scss`, `.less`                                     | `.less` is not in `format-prettier`                         |
| `.yml`, `.yaml`                                              |                                                             |
| `.toml`                                                      | Prettier has no TOML parser                                 |
| `.html`                                                      | oxfmt sends HTML to the Prettier that its npm package holds |

After a Bash call, the hook formats Markdown only, with the same sweep as `format-prettier`: the Markdown paths that the command names, and the changed and untracked Markdown files of each repository that the command touches. See [Bash (markdown sweep)](../format-prettier/README.md#bash-markdown-sweep). The amend hint after a commit is also the same, see [Write and commit in one command](../format-prettier/README.md#write-and-commit-in-one-command).

The hook skips a file under `/tmp`, `/var/tmp`, or `$TMPDIR`, a path that is not a regular file, and a file whose repository sets `agent-hook.format-oxfmt.enabled` to `false`.

## Requirements

- **oxfmt** on `PATH`, the npm package. The standalone binary from the GitHub release skips `.html` with exit `0`. oxfmt releases each week and has had breaking changes, so install a pinned version and read the release notes before an upgrade:

  ```sh
  pnpm add -g oxfmt@0.74.0
  ```

- **git**, for the switch, the Bash sweep, and the amend hint.
- **Node 23.6 or later** for `command.ts`, which Codex and `format-staged-files` run.

Without oxfmt, a run fails to start and the hook changes nothing. `format-prettier` does not take over in that case: the key decides, not the install.

## Config

oxfmt does not read `.prettierrc`. It looks for `.oxfmtrc.json`, `.oxfmtrc.jsonc`, `oxfmt.config.ts`, or `oxfmt.config.mts`, from the folder of each file up, and the nearest config wins.

With no config, oxfmt uses a print width of 100 and sorts the keys of `package.json`. Prettier uses 80 and does not sort. So the hook gives each file that has no oxfmt config the bundled [`config/oxfmtrc.json`](config/oxfmtrc.json): `printWidth` 80 and `sortPackageJson` false. `-c` turns off the config search, so a call with both kinds of files starts two oxfmt runs.

A project with a `.prettierrc` and no oxfmt config gets the bundled config, not its Prettier style. To keep the style, run `oxfmt --migrate prettier` in that project, which writes `.oxfmtrc.json` from a JSON or JS Prettier config. Or turn the hook off there with `/toggle-hook --repo format-oxfmt`.

`proseWrap` is `preserve` by default in oxfmt, so the one-line paragraphs of Markdown stay on one line. `format-prettier` passes `--prose-wrap preserve` for the same result.

## Ignore rules

oxfmt reads `.gitignore` and `.prettierignore` in the session folder, but it formats a gitignored file that the command line names. A file that `.prettierignore` lists stays as it is. So the hook passes no `--ignore-path`, and it gets the behavior that `format-prettier` gets with `--ignore-path .prettierignore`. A `--ignore-path` to a file that does not exist makes oxfmt exit `1` and format nothing.

## Settings

| Setting                                            | Effect                                                                                                           |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `git config agent-hook.format-oxfmt.enabled true`  | Turns the hook on, and `format-prettier` off for the same calls. Set it globally or in one repository.           |
| `git config agent-hook.format-oxfmt.enabled false` | In a repository, wins over a global `true`: `format-prettier` formats there.                                     |
| `AGENT_HOOKS_DISABLE`                              | A value that names `format-oxfmt` gives the session back to `format-prettier`. `format-staged-files` ignores it. |
| `.oxfmtrc.json` and the other oxfmt configs        | The style of the project. A file with none gets the bundled config.                                              |
| `.prettierignore`                                  | oxfmt skips the files that it lists.                                                                             |

To remove the hook from one agent, remove its entry from the file in the "Loaded by" column of the adapter table. In Codex, remove the two entries in `dot_codex/modify_hooks.json`.

## Failure behavior

The hook never blocks and never prints an error. A file that does not parse makes oxfmt exit `2`, and oxfmt still formats the other files of the run. A missing oxfmt, a timeout of 20 s, or a cwd that does not exist leaves the files as they are.

## Files

| File                                                             | Role                                                                                      |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| [`core.ts`](core.ts)                                             | The extensions, the config lookup, and the oxfmt command lines                            |
| [`shared.ts`](shared.ts)                                         | The sweep, the switch, the run, and the amend hint. The same file as in `format-prettier` |
| [`io.ts`](io.ts)                                                 | The file and process functions under Node, and the folder of the bundled config           |
| [`command.ts`](command.ts), [`pi.ts`](pi.ts), [`omp.ts`](omp.ts) | The adapters for Codex and `format-staged-files`, pi, and omp                             |
| [`hooks/register.ts`](hooks/register.ts), `hooks/hooks.json`     | The Claude Code mod                                                                       |
| [`config/oxfmtrc.json`](config/oxfmtrc.json)                     | The config for a file with no oxfmt config                                                |
| [`dot_claude-plugin/plugin.json`](dot_claude-plugin/plugin.json) | The plugin manifest, deployed as `.claude-plugin/plugin.json`                             |

A Claude Code mod imports only files inside its own plugin folder, so `shared.ts` and `omp.ts` are copies of the files in `format-prettier`. Change both copies. [`test/check.ts`](test/check.ts) fails when they differ.

## Testing

See [`docs/testing.md`](docs/testing.md).
