# block-secret-commits

Blocks a `git commit` that would commit a secret, before the commit runs. It is a safety net for an accidental `git add .`, not a replacement for a good `.gitignore`.

One scanner, [`core.ts`](core.ts), serves four agents through two adapters:

| Agent              | Adapter                                                                                                               | Loaded by                                                                                          |
| ------------------ | --------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Claude Code, Codex | [`guard.sh`](guard.sh), a `PreToolUse` command hook on Bash, runs [`command.ts`](command.ts): exit 2 and stderr block | `settings.json.tmpl` and `dot_codex/modify_hooks.json`                                             |
| pi and omp         | [`pi.ts`](pi.ts): `tool_call` on bash returns `{ block, reason }`                                                     | `extensions` in `dot_pi/agent/modify_settings.json` and `dot_omp/private_agent/private_config.yml` |

Claude Code runs a command hook and not a mod, because the binary scan copies files, which the mod API cannot do. See [`docs/hooks/decisions.md`](../../../docs/hooks/decisions.md#block-secret-commits-is-a-command-hook-in-claude-code).

This file tells what the hook does and how to work around it. [docs/implementation.md](docs/implementation.md) gives the reason for each decision. [docs/research.md](docs/research.md) holds the measurements, and the alternatives that were tested and rejected.

## What it checks

The hook runs before each shell command: `PreToolUse` on Bash in Claude Code and Codex, and `tool_call` on bash in pi and omp. It stops at once unless the command is a `git ... commit`. Then it runs two checks:

- **betterleaks scan:** scans the staged diff with [betterleaks](https://github.com/betterleaks/betterleaks), a secret scanner. It finds a secret value in an ordinary file, and a file whose name alone marks it as a secret.
- **Binary scan:** scans the newly added binary files again, because the staged diff cannot show their content.

### Commit only, not `git add`

Both checks read the index. The hook runs before the command that it guards, so at `git add` time the index does not yet hold the files that the command adds. The hook does not block a `git add` that stages a secret. It blocks the commit that would include it, so the secret does not reach a commit.

### Staged files only

Both checks see only what the commit would add. A secret-shaped file that is untracked in the working tree does not block an unrelated commit. It blocks the commit that stages it.

### Secret values and secret file names

The betterleaks scan blocks on two kinds of finding, and the block message tells which kind it is:

- **A content rule** matched a secret value on a line, for example `generic-api-key` or `github-pat`.
- **The `secret-filename` rule** matched the file name alone.

A content rule matches secret _values_, so it cannot flag a `.pgpass` or a `.netrc`. These files hold a human-chosen password with no entropy and no vendor prefix. The name rule closes this gap, see [the measurements](docs/research.md#why-the-name-rule-earns-its-place).

The name rule matches each file name that ends in `.env`, not only `.env`, so `prod.env` and `config/production.env` block. Template names are exempt in both spellings: `.env.example` and `example.env` commit freely, and so do `.sample`, `.template`, and `.dist`. Encrypted files (`*.gpg`, `*.pgp`) and public keys (`id_rsa.pub`, `*.crt`) do not match, because a commit of these files is a normal workflow.

### Binary files

betterleaks cannot read a binary blob in git mode, so a keystore, a key bundle, or a database dump would reach the commit unread. The binary scan closes this gap for newly added binary files. An ordinary image, font, or archive commits freely. A binary that holds a secret blocks, also under a neutral name such as `payload.dat`, which no file-name rule matches.

A modified tracked binary is not checked. It was checked when it was first added, and an update to a committed image is routine. As a result, the hook does not see a secret that you put into a binary that git already tracks.

### `git commit -a`

`-a` stages tracked changes after the hook has run, so the index that the hook reads does not hold them yet. When the command has `-a` or `--all` and the staged scan reports no finding, the hook runs a second scan over the unstaged changes to tracked files. These cases change the result:

- **A flag after the message**, as in `git commit -m wip -a`, is not seen. The hook reads the command only up to `-m ` or `--message`, so the second scan does not run.
- **A staged finding in an allowlisted file** also stops the second scan. The allowlist then removes that finding, and the commit passes without a scan of the working tree.
- **A message glued to the flag**, as in `git commit -m"..."`, can cost one extra scan. That scan can block on a working-tree secret that the commit would not include.

### `git commit --amend`

`--amend` with an empty index rewrites content that is already in `HEAD`, and a staged scan does not read that content. The first commit of that content was scanned, so the gap matters only for a commit from before this hook.

## Requirements

In Claude Code and Codex, `command.ts` needs Node 23.6 or later, which runs `.ts` files without a flag. Without it, `guard.sh` blocks each `git commit`, see [Failure behavior](#failure-behavior). pi and omp load `pi.ts` in their own runtime.

Both checks need betterleaks on `$PATH`. Without it, the betterleaks scan does nothing and the binary scan blocks each newly added binary. Install betterleaks with one of these commands:

```sh
brew install betterleaks # macOS
go install github.com/betterleaks/betterleaks@latest # any platform with Go
```

The devcontainer has no Homebrew and no Go toolchain. There, put a release binary on `$PATH`:

```sh
mkdir -p ~/.local/bin
curl -sL https://github.com/betterleaks/betterleaks/releases/download/v1.7.4/betterleaks_1.7.4_linux_arm64.tar.gz | tar xz -C ~/.local/bin betterleaks
```

The version is in both the tag and the file name. Check the [releases page](https://github.com/betterleaks/betterleaks/releases) for the current version and your architecture.

## How it works

1. The hook tests the command for `git` and the word `commit`. Each other command passes.
2. It finds the repo root: `CLAUDE_PROJECT_DIR`, then the `cwd` of the payload, then its own working folder. pi and omp use the working folder of the agent.
3. It reads the allowlist from `.agent-allow-secrets` and `AGENT_ALLOW_SECRETS`, see [Overrides](#overrides).
4. It asks `betterleaks config path` which config betterleaks would use. It passes `conf/betterleaks.toml` only when no other config applies, see [Per-repo configs](#per-repo-configs).
5. It runs the binary scan. When a binary blocks, the hook stops here.
6. It runs `betterleaks git --staged`, which scans the index against `HEAD`. For `git commit -a`, it can run a second scan, see [`git commit -a`](#git-commit--a).
7. It removes the findings in allowlisted files and blocks on each finding that is left.

A command that is not a commit costs about 25 ms in Claude Code and Codex, which is the Node start, and less than 1 ms in pi and omp ([Cost](docs/research.md#cost)).

### The binary scan

git selects the newly added files that it cannot show as text. These are the files that `betterleaks git` skips. The hook scans them with `betterleaks dir`, which reads binary files.

The hook copies each file to a neutral name first. The default betterleaks config exempts image, font, and office extensions from every rule, so a key in `logo.png` or a password list in `notes.xlsx` would scan clean under its own name. A file above 100 MiB keeps its own path, because the copy costs more than the gap that it closes. See [The extension allowlist](docs/implementation.md#the-extension-allowlist).

## What the model sees

The hook gives the model a block message when it blocks a commit.

- **Claude Code and Codex:** exit code 2 blocks the call, with the block message on stderr. Exit code 0 allows it. stdout stays empty, because Codex reports any stdout of a command hook as a failed hook.
- **pi and omp:** `pi.ts` returns `{ block: true, reason }`, with the block message as the reason.

A content block message names the rule, the file, the line, and the fingerprint of each finding. `--redact` keeps the secret value out of the report, the hook output, and the context of the model. The message gives the command to inspect the finding and lists the fixes in this order: remove the secret or add the file to `.gitignore`, a `betterleaks:allow` comment, a `.betterleaksignore` entry, and, as the last resort, `.agent-allow-secrets`.

A binary block message lists the paths of the files. It gives the command to inspect a file and lists the fixes: drop the file or add it to `.gitignore`, `.agent-allow-secrets`, or `AGENT_ALLOW_SECRETS`.

## What you see

- **A capped scan:** when a betterleaks scan reaches its 4 s cap, the hook gives a warning with the command to run by hand. In Claude Code and Codex the warning goes to stderr with exit code 0. In pi and omp it is a notification.
- **No usable Node:** the `SessionStart` check of Claude Code and Codex gives a warning at the start of the session, see [the hooks README](../README.md#shared-conventions).

## Settings

### Turn the hook off

The hook does not read `CLAUDE_HOOKS_DISABLE`. To turn it off, remove its entry from the file that loads it, in the table at the top. To let one file through, use an [override](#overrides).

### The name rules

The names are in the `secret-filename` rule in [`conf/betterleaks.toml`](conf/betterleaks.toml). Edit the `path` pattern there to change what counts as a secret.

Read [Rule dialect](docs/implementation.md#rule-dialect) before you edit the pattern. Patterns are Go RE2, which has no lookahead. An incorrect pattern turns off the scan with no sign, so run `node test/check.ts` after each edit. [Name ruleset provenance](docs/research.md#name-ruleset-provenance) records where the list came from and which upstream lists were rejected.

### Per-repo configs

The hook passes `--config` only when `betterleaks config path` answers `default`, which means that nothing else selected a config. A repo with its own `.betterleaks.toml` or `.gitleaks.toml` keeps its config. Such a repo keeps the content rules and loses the name rules. Its config can extend this file to get them back:

```toml
[extend]
path = "~/.claude/hooks/block-secret-commits/conf/betterleaks.toml"
```

The shipped config sets `[extend] useDefault = true`, so the upstream rules and their allowlist still apply. For example, the AWS example key `AKIAIOSFODNN7EXAMPLE` does not block a commit.

### Overrides

Select the override by the check that blocked you. A content finding names a rule, a file, and a line, and the escape hatches of betterleaks cover it. A binary scan block names a path only, and no betterleaks setting can exempt it, so it needs the list of this hook.

| Override                                     | Content finding | Binary scan | Portable |
| -------------------------------------------- | --------------- | ----------- | -------- |
| 1. `.gitignore`                              | Yes             | Yes         | Yes      |
| 2. `betterleaks:allow`, `.betterleaksignore` | Yes             | No          | Yes      |
| 3. `.agent-allow-secrets`                    | Yes             | Yes         | No       |
| 4. `AGENT_ALLOW_SECRETS`                     | Yes             | Yes         | No       |

#### 1. gitignore (preferred)

git does not stage a gitignored file, so neither check sees it. This is almost always the correct fix: a secret that must not be committed goes in `.gitignore`, and the hook stays silent. Use the other overrides only when you intend to commit a secret-shaped file or a binary file.

#### 2. betterleaks escape hatches (a content finding)

These overrides are features of betterleaks, so they are portable. A teammate who scans the same repo without this hook gets the same result. A repo that already has a gitleaks config continues to work with no change.

- **Inline comment:** put a `betterleaks:allow` comment on the flagged line. `gitleaks:allow` also works. Use it for a value that looks like a secret but is not, such as a test fixture or a documented example key.
- **Ignore file:** add the fingerprint from the block message to `.betterleaksignore` in the repo root, one per line. `.gitleaksignore` also works.
- **Custom rules:** put a `.betterleaks.toml` or `.gitleaks.toml` in the repo root, or set `BETTERLEAKS_CONFIG` to a shared config. See [Per-repo configs](#per-repo-configs) for what that turns off.

A fingerprint is `file:rule:line`, for example `app.py:generic-api-key:42`. The ignore file accepts only this exact form. It ignores a bare path, a `file:rule` pair, and a glob with no sign, see [the measurements](docs/research.md#what-betterleaksignore-accepts).

One entry clears one secret on one line, so a file with five secrets needs five entries. The line number is part of the key: when you add a line above the secret, the entry stops to match and the commit blocks again. betterleaks always reports a `secret-filename` finding on line 1, so that entry does not move.

#### 3. Per-repo allowlist file (a binary scan block)

Create a `.agent-allow-secrets` file in the repo root, with one file that you intend to commit on each line. An entry matches a repo-relative path or a bare basename. The hook ignores blank lines and lines that start with `#`. A `#` after a path is part of the entry, so put a comment on its own line:

```sh
# .agent-allow-secrets
# A keystore fixture that the binary scan blocks.
test/fixtures/keystore.p12
# A blob that betterleaks cannot clear.
build/assets.bin
# A bare basename: each file named .pgpass, in any folder.
.pgpass
```

The list is for you, the user of this hook. Keep it out of git with the exclude file of the repo, not with `.gitignore`, which the team shares. This line covers the allow files of both guards, and all worktrees share the exclude file:

```sh
echo '.agent-allow-*' >> "$(git rev-parse --path-format=absolute --git-path info/exclude)"
```

This list is the only override for a binary scan block, because that scan gives no stable fingerprint. See [Why this list exists at all](docs/implementation.md#why-this-list-exists-at-all).

An entry exempts the file from every check, the content rules included. Only the listed files are exempt, and each other file still blocks.

For a content finding, this list is the last resort, because nobody without this hook sees the exemption. One case still needs it: a `secret-filename` finding that you want to clear by bare basename in many folders. No fingerprint can express that.

#### 4. Environment variable

Set `AGENT_ALLOW_SECRETS` to the files to exempt, separated by whitespace or colons. It uses the same path or basename match and covers the same checks:

```sh
AGENT_ALLOW_SECRETS=test/fixtures/keystore.p12:.pgpass
```

Use it for a one-time or session-scoped exemption that leaves no trace in the repo.

## Failure behavior

The two checks fail in opposite directions by design. The betterleaks scan fails open: when it cannot run, it allows the commit. The binary scan fails closed: it blocks each file that it cannot clear.

| Failure                                                                                         | Result                         | What you see                              |
| ----------------------------------------------------------------------------------------------- | ------------------------------ | ----------------------------------------- |
| `node` missing, older than 23.6, or `command.ts` fails (Claude Code, Codex)                     | Each `git commit` blocks       | A block message that names the problem    |
| betterleaks missing                                                                             | betterleaks scan allows        | Nothing                                   |
| betterleaks missing                                                                             | Each newly added binary blocks | A binary block message                    |
| Scanner error, report that does not parse, or config that does not parse                        | betterleaks scan allows        | Nothing                                   |
| Not a git repository                                                                            | Both checks allow              | Nothing                                   |
| betterleaks scan reaches the 4 s cap                                                            | betterleaks scan allows        | A warning with the command to run by hand |
| `betterleaks dir` fails or reaches the cap, or a staged file is unreadable or left the worktree | That binary blocks             | A binary block message                    |
| An error in the binary scan code                                                                | The commit blocks              | `the binary scan of this commit failed`   |

With no usable `node`, `guard.sh` lets each other command pass. An app that you start from the macOS Dock can get a shorter `$PATH` than your terminal, so this block can occur there first.

The capped scan is the one fail-open path that you cannot infer from a clean run, so it gives a warning. A config error stops betterleaks, so a typo in `conf/betterleaks.toml` turns off the whole betterleaks scan with no sign. Run `node test/check.ts` after you edit that file.

## Testing

`node test/check.ts` runs the hook on throwaway repos and checks both scans, `guard.sh`, and `pi.ts`. See [docs/testing.md](docs/testing.md).
