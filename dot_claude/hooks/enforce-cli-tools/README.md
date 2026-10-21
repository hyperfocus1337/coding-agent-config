# enforce-cli-tools

Blocks a shell command that runs a banned CLI tool and tells the model which tool to use instead. The line in `rules/tools.md` makes blocks rare, and the hook catches the cases where the model misses that instruction.

One matcher, [`core.ts`](core.ts), serves four agents through three adapters:

| Agent       | Adapter                                                                                 | Loaded by                                                                                          |
| ----------- | --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Claude Code | [`hooks/register.ts`](hooks/register.ts), a mod: `tool.call` on Bash returns `{ deny }` | `CLAUDE_CODE_PLUGIN_DIRS` in `settings.json.tmpl`                                                  |
| pi and omp  | [`pi.ts`](pi.ts): `tool_call` on bash returns `{ block, reason }`                       | `extensions` in `dot_pi/agent/modify_settings.json` and `dot_omp/private_agent/private_config.yml` |
| Codex       | [`command.ts`](command.ts): exit code 2 with the message on stderr                      | `PreToolUse` in `dot_codex/modify_hooks.json`                                                      |

The design behind this layout is in [`docs/hooks/`](../../../docs/hooks/README.md). The internals of the hook are in [`docs/implementation.md`](docs/implementation.md).

## What it checks

The hook runs before each shell call: Bash in Claude Code and Codex, and bash in pi and omp. It blocks the call when a banned tool is in command position. The shipped rules ban `npm` and `yarn`, with `pnpm` as the replacement.

The rules are data, not code. To ban another tool, add one line to [`rules`](rules). See [Rules](#rules).

## Requirements

- **Claude Code:** version 2.1.296 or later, the oldest version tested.
- **pi and omp:** none. They load `pi.ts` in their own runtime.
- **Codex:** Node 23.6 or later on `PATH`. This version runs `.ts` files without a flag.

Codex runs a hook only after you trust its entry. After the change from `hook.sh` to `command.ts`, trust the hooks again in the Codex TUI, on the host and in the devcontainer. See [`docs/agents/codex.md`](../../../docs/agents/codex.md#trust).

## How it works

The hook checks only the **command position**: the first word of each command that the line runs. A banned name in an argument or in text does not count. For each Bash call, the hook does these steps:

1. It splits the line into commands at `&`, `|`, `;`, and newlines. It also splits at the brackets of a subshell `( )`, a group `{ ...; }`, a substitution `$( )`, and backticks, so the command inside them counts wherever it sits in the line. A separator inside a quoted string does not split.
2. In each command, it steps over `VAR=value` assignments and these wrappers: `sudo`, `env`, `command`, `builtin`, `exec`, `nohup`, `time`, `timeout`, `nice`, `stdbuf`, `xargs`. After a wrapper, it also steps over each word that starts with `-` or a digit, such as `30` in `timeout 30`.
3. It removes a leading path from the next word and compares the word with the rules.
4. It reports only the **first** violation. One clear message is better than a list, and the fix runs the hook again.

These commands block:

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

### Gaps

A heredoc with a quoted delimiter (`<<'EOF'`, `<<"EOF"`, `<<\EOF`) runs nothing, so the hook ignores its body. Three gaps remain:

- An unquoted heredoc body can run `$(...)`, so the hook still splits it. A separator in its text can start a false command and block the call. The [overrides](#allow-a-tool-in-one-repo) clear that case.
- A banned tool inside a quoted span is invisible, so `sh -c 'npm i'` passes.
- A wrapper flag value that is a word counts as the command. `sudo -u root npm i` and `timeout -s KILL 30 npm ci` pass, because the hook reads `root` and `KILL` as the command.

A real shell-word parser is the upgrade path. The heredoc gap and the quoted-span gap are not worth one yet.

## What the model sees

A clean command produces no output. A block gives the model this message, here for `npm i` in `/path/to/repo`:

```text
Blocked: `npm` is not allowed here, use `pnpm` instead.
  suggested: pnpm i

Allow it anyway with one of:
  * add "npm" to /path/to/repo/.agent-allow-cli-tools (persistent, per-repo),
    and keep it out of git: echo '.agent-allow-*' >> "$(git -C "/path/to/repo" rev-parse --path-format=absolute --git-path info/exclude)"
  * set AGENT_ALLOW_CLI_TOOLS=npm (one-off, colon-separated)
```

The `suggested` line swaps the first whole-word match of the banned tool for the replacement, so the model can retry in one turn. A multi-line command gets no suggestion, because the model already has it.

Each adapter sends the message in its own way:

- **Claude Code:** the mod returns `{ deny: <message> }`.
- **pi and omp:** `pi.ts` returns `{ block: true, reason: <message> }`.
- **Codex:** `command.ts` writes the message to stderr and exits 2.

`command.ts` uses these exit codes:

- `0`: the call runs. No output.
- `1`: the payload is not valid JSON. The call runs, because only exit code 2 blocks.
- `2`: the call is blocked. The message is on stderr.

A clean command costs zero tokens, and a block costs about 120 tokens for the message. See [`docs/research.md`](docs/research.md) for the cost per call and why the hook blocks and does not rewrite the command.

## Settings

### Rules

[`rules`](rules) holds one `<banned> <replacement>` pair on each line. The hook ignores blank lines and lines that start with `#`:

```text
npm	pnpm
yarn pnpm
```

To enforce another tool, add a line. The replacement takes the rest of the line, so it can be several words: `npx	pnpm dlx` blocks `npx create-vite app` and suggests `pnpm dlx create-vite app`.

### Allow a tool in one repo

Create `.agent-allow-cli-tools` in the repo root, with one tool on each line. The hook ignores blank lines and text after `#`:

```sh
# .agent-allow-cli-tools
npm # this client's repo is npm-only, package-lock.json is committed
```

The file stays across sessions. Use it for a repo that does not use pnpm. The exemption is for you, the user of this hook, so keep the file out of git with the exclude file of the repo, not `.gitignore`.

This command adds the exclude line. One line covers the allow files of both guards, `enforce-cli-tools` and `block-secret-commits`, and all worktrees share the exclude file:

```sh
echo '.agent-allow-*' >> "$(git rev-parse --path-format=absolute --git-path info/exclude)"
```

The hook reads the file from the project root of the session:

- **Claude Code:** `$.session.root()`.
- **pi and omp:** the working directory of the agent.
- **Codex:** `CLAUDE_PROJECT_DIR`, else the payload `cwd`, else the working directory of `command.ts`.

### Allow a tool for one session

Set `AGENT_ALLOW_CLI_TOOLS` to the tools to exempt, separated by whitespace or colons:

```sh
AGENT_ALLOW_CLI_TOOLS=npm:yarn
```

Use it for a one-off, or for a session that must leave no trace in the repo.

### Turn the hook off

The allow file and the variable add to each other, and each names the tools that stay allowed. An exemption for `npm` keeps every other rule, so neither override turns the whole hook off.

The hook does not read `CLAUDE_HOOKS_DISABLE`, so [`/toggle-hook`](../toggle-hook/README.md) cannot turn it off. To turn it off in one agent, remove its entry from the file in the "Loaded by" column of the table above.

## Failure behavior

The hook fails open in every agent, so a broken hook never blocks work:

- **Claude Code:** Claude Code skips a mod hook that throws, and the call runs.
- **pi and omp:** `pi.ts` catches its own errors, because pi blocks a call when a handler throws.
- **Codex:** `command.ts` exits 1 on a bad payload, and the call runs. The Codex entry starts with `command -v node || exit 0`, so a machine without Node is not blocked.
- **Missing rules:** if the `rules` file is missing or empty, the hook allows everything, so a half-deployed config never blocks work.

## Testing

[`test/check.ts`](test/check.ts) checks the matcher and the three adapters. See [`docs/testing.md`](docs/testing.md).
