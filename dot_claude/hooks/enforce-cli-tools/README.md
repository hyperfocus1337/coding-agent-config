# enforce-cli-tools

Blocks a shell command that runs a banned CLI tool and tells the model which tool to use instead. It ships with `npm → pnpm` and `yarn → pnpm`. The mapping is data, not code: to add a rule, add one line to [`rules`](rules).

One matcher, [`core.ts`](core.ts), serves four agents through three adapters:

| Agent       | Adapter                                                                                 | Loaded by                                                                                          |
| ----------- | --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Claude Code | [`hooks/register.ts`](hooks/register.ts), a mod: `tool.call` on Bash returns `{ deny }` | `CLAUDE_CODE_PLUGIN_DIRS` in `settings.json.tmpl`                                                  |
| pi and omp  | [`pi.ts`](pi.ts): `tool_call` on bash returns `{ block, reason }`                       | `extensions` in `dot_pi/agent/modify_settings.json` and `dot_omp/private_agent/private_config.yml` |
| Codex       | [`command.ts`](command.ts): exit code 2 with the message on stderr                      | `PreToolUse` in `dot_codex/modify_hooks.json`                                                      |

The design and the tests behind this layout are in [`docs/hooks-feasibility.md`](../../../docs/hooks-feasibility.md).

## How it works

The hook checks only the **command position**, never a substring or a word anywhere in the command. It first blanks quoted spans, so a separator in a string cannot split the command. It then splits the rest into segments on `&`, `|`, `;`, newlines, and the brackets that open a subshell, a group or a substitution: what runs inside `$(...)`, backticks or `{ ...; }` is its own command, wherever it sits in the line. In each segment the hook steps over `VAR=value` assignments and the usual wrappers (`sudo`, `env`, `command`, `builtin`, `exec`, `nohup`, `time`, `timeout`, `nice`, `stdbuf`, `xargs`), and after a wrapper also over its flags and their values. It then removes a leading path from the next word and compares it with the rules. These commands block:

```sh
npm i                  # plain invocation
sudo npm ci            # wrapper skipped
CI=1 npm run build     # env assignment skipped
timeout 30 npm ci      # wrapper argument skipped too
/usr/local/bin/npm i   # path stripped
cd web && yarn add x   # second segment
cd web
npm i                  # second line
(cd web && npm i)      # subshell
{ npm i; }             # group
echo $(npm bin)        # substitution, even as an argument
```

These commands pass, because the banned name is never in command position:

```sh
rg npm
git commit -m "switch to npm"
git commit -m "fix; npm bump"   # separator inside a quoted string
echo "a && npm i"
cat package-lock.json
npmrc-check
```

A heredoc with a quoted delimiter (`<<'EOF'`, `<<"EOF"`, `<<\EOF`) runs nothing, so the hook drops its body before the split. Two gaps remain:

- An unquoted heredoc body can run `$(...)`, so the hook still splits it naively. A separator in its text can start a false segment and block. The overrides below clear that case.
- A banned tool inside a quoted span is invisible, so `sh -c 'npm i'` passes.

A real shell-word parser is the upgrade path for both, and neither gap is worth one yet.

The hook reports only the **first** violation. One clear message is better than a list, and the fix runs the hook again.

## Cost

| Agent       | Cost of a call                                                                                                               |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Claude Code | The mod runs in the Claude Code process and starts no program. It reads `rules` and the allowlist file on each Bash call.    |
| pi and omp  | The extension runs in the agent process.                                                                                     |
| Codex       | `command.ts` starts Node: about 18 ms for each Bash call, against 1.5 ms for the old bash hook (median of 20 runs on Linux). |

A clean command costs **zero tokens**. A block costs about 80 tokens for the message (about 320 characters, more with a long repo path), plus the turn that produced the rejected command. Both the rejected call and the message stay in the transcript. A silent rewrite would cost nothing, but the model would never learn the rule and would keep reaching for `npm`. The line in `rules/tools.md` makes blocks rare, and the hook catches the cases where the model misses the instruction.

## The rules

[`rules`](rules) holds one `<banned> <replacement>` pair on each line. Blank lines and `#` comments are ignored:

```sh
npm	pnpm
yarn pnpm
```

To enforce another tool, add a line. The replacement takes the rest of the line, so it can be several words: `npx	pnpm dlx` blocks `npx create-vite app` and suggests `pnpm dlx create-vite app`. The replacement is used twice: in the message "use `X` instead", and in a suggested command that swaps the first whole-word match of the banned word, so the model can retry in one turn. A multi-line command gets no suggestion, because the model already has it.

If the rules file is missing or empty, the hook allows everything, so a half-deployed config never blocks work.

## Overrides

Both overrides name the tool that stays allowed, so they never turn the whole hook off.

**1. Allowlist file for each repo.** Create `.claude-allow-cli-tools` in the repo root, with one tool on each line. `#` comments and blank lines are ignored:

```sh
# .claude-allow-cli-tools
npm # this client's repo is npm-only, package-lock.json is committed
```

The file stays across sessions, and you can commit it so the whole team gets the exemption. Use it for a repo that does not use pnpm. The hook reads it from the session's project root: `$.session.root()` in Claude Code, the working directory in pi and omp, and `CLAUDE_PROJECT_DIR` or the payload `cwd` in Codex.

**2. Environment variable.** Set `CLAUDE_ALLOW_CLI_TOOLS` to the tools to exempt, separated by whitespace or colons:

```sh
CLAUDE_ALLOW_CLI_TOOLS=npm:yarn
```

Use it for a one-off or a session that must leave no trace in the repo.

Both overrides add to each other and apply to named tools only: an exemption for `npm` keeps every other rule.

## Why a hook and not a permissions rule

`settings.json` can deny commands directly (`"permissions": {"deny": ["Bash(npm:*)"]}`), and its matcher uses a real parser. This hook exists because a deny rule can only refuse:

- It cannot name the replacement or suggest a corrected command.
- It cannot be exempted for one repo: deny always wins over allow, so nothing can do what `.claude-allow-cli-tools` does.
- pi, omp and Codex do not read it.

If those three points stop mattering, a deny rule plus the line in `rules/tools.md` replaces this directory.

## Failure behavior

The hook fails open in every agent, so a broken hook never blocks work:

- Claude Code skips a mod hook that throws, and the call runs.
- `pi.ts` catches its own errors, because pi blocks a call when a handler throws.
- `command.ts` exits 1 on a bad payload. Only exit code 2 blocks.

## Dependencies

The mod needs none. `pi.ts` and `command.ts` need Node 23.6 or later, which runs `.ts` files without a flag. The Codex entry starts with `command -v node || exit 0`, so a machine without Node is not blocked.

Codex runs a hook only after you trust its entry. After the change from `hook.sh` to `command.ts`, trust the hooks again in the Codex TUI, on the host and in the devcontainer. See [`docs/agents/codex.md`](../../../docs/agents/codex.md#trust).

## Tests

`node test/check.ts` checks the matcher and the three adapters. See [test/README.md](test/README.md).

## Files

| File                                    | Deployed to `~/.claude/hooks/enforce-cli-tools/` | Role                                                                                     |
| --------------------------------------- | ------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| `core.ts`                               | Yes                                              | Matcher and block message. No I/O.                                                       |
| `hooks/register.ts`, `hooks/hooks.json` | Yes                                              | Claude Code mod                                                                          |
| `dot_claude-plugin/plugin.json`         | Yes, as `.claude-plugin/plugin.json`             | Plugin manifest                                                                          |
| `pi.ts`                                 | Yes                                              | pi and omp extension                                                                     |
| `command.ts`                            | Yes                                              | Codex command hook                                                                       |
| `io.ts`                                 | Yes                                              | Node reads of `rules`, the allowlist file and the variable, for `pi.ts` and `command.ts` |
| `rules`                                 | Yes                                              | The rules table                                                                          |
| `README.md`, `test/`                    | No                                               | Kept in the repo by `.chezmoiignore`                                                     |
