# block-secret-commits

A git `pre-commit` hook that blocks a commit that would add a secret. It is a safety net for an accidental `git add .`, not a replacement for a good `.gitignore`.

It is a git hook, not an agent hook. It runs on every commit: yours, and the commits of Claude Code, pi, omp, and Codex. [`main.ts`](main.ts) holds both scans and the git entry point. An agent cannot skip it with `git commit --no-verify` or `-n`: the [`local.git_hooks`](../../../dcg/README.md#custom-packs) pack of dcg blocks that command.

This file tells what the hook does and how to work around it. [docs/implementation.md](docs/implementation.md) gives the reason for each decision. [docs/research.md](docs/research.md) holds the measurements, and the alternatives that were tested and rejected.

## What it checks

Git starts the hook on each `git commit`, in each repository, before it writes the commit. The hook runs two checks:

- **betterleaks scan:** scans the staged diff with [betterleaks](https://github.com/betterleaks/betterleaks), a secret scanner. It finds a secret value in an ordinary file, and a file whose name alone marks it as a secret.
- **Binary scan:** scans the newly added binary files again, because the staged diff cannot show their content.

### Commit only, not `git add`

The hook does not block a `git add` that stages a secret. It blocks the commit that would include it, so the secret does not reach a commit.

### Staged files only

Both checks read the index that git is about to commit, so they see only what the commit would add. For `git commit -a` and `git commit <path>`, git builds a temporary index and sets `GIT_INDEX_FILE` before the hook runs, so the checks see the files that these commits take. A secret-shaped file that is untracked in the working tree does not block an unrelated commit. It blocks the commit that stages it.

### Secret values and secret file names

The betterleaks scan blocks on two kinds of finding, and the block message tells which kind it is:

- **A content rule** matched a secret value on a line, for example `generic-api-key` or `github-pat`.
- **The `secret-filename` rule** matched the file name alone.

A content rule matches secret _values_, so it cannot flag a `.pgpass` or a `.netrc`. These files hold a human-chosen password with no entropy and no vendor prefix. The name rule closes this gap, see [the measurements](docs/research.md#why-the-name-rule-earns-its-place).

The name rule matches each file name that ends in `.env`, not only `.env`, so `prod.env` and `config/production.env` block. Template names are exempt in both spellings: `.env.example` and `example.env` commit freely, and so do `.sample`, `.template`, and `.dist`. Encrypted files (`*.gpg`, `*.pgp`) and public keys (`id_rsa.pub`, `*.crt`) do not match, because a commit of these files is a normal workflow.

### Binary files

betterleaks cannot read a binary blob in git mode, so a keystore, a key bundle, or a database dump would reach the commit unread. The binary scan closes this gap for newly added binary files. An ordinary image, font, or archive commits freely. A binary that holds a secret blocks, also under a neutral name such as `payload.dat`, which no file-name rule matches.

A modified tracked binary is not checked. It was checked when it was first added, and an update to a committed image is routine. As a result, the hook does not see a secret that you put into a binary that git already tracks.

### `git commit --amend`

`--amend` with an empty index rewrites content that is already in `HEAD`, and a staged scan does not read that content. The first commit of that content was scanned, so the gap matters only for a commit from before this hook.

## Requirements

- **git** with config-based hooks: `hook.<name>.command` and `hook.<name>.event`. An older git ignores the `hook.*` entries and shows no error.
- **Node 23.6 or later** on the `PATH` of git, which runs `.ts` files without a flag. Without it, each commit blocks, see [Failure behavior](#failure-behavior).

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

[`dot_config/git/config`](../../config) sets the hook in `~/.config/git/config`, after `format-staged-files`, so the scan reads the index after that hook restages formatted files:

```ini
[hook "block-secret-commits"]
	event = pre-commit
	command = "command -v node >/dev/null || { echo '...' >&2; exit 1; }; NODE_COMPILE_CACHE=\"$HOME/.cache/node-compile-cache\" node \"$HOME/.config/git/hooks/block-secret-commits/main.ts\""
```

1. Git runs `main.ts` at the root of the worktree, which is the repo root of the hook.
2. It reads the allowlist from `.agent-allow-secrets` and `AGENT_ALLOW_SECRETS`, see [Overrides](#overrides).
3. It asks `betterleaks config path` which config betterleaks would use. It passes `conf/betterleaks.toml` only when no other config applies, see [Per-repo configs](#per-repo-configs).
4. It runs the binary scan. When a binary blocks, the hook stops here.
5. It runs `betterleaks git --staged`, which scans the index against `HEAD`.
6. It removes the findings in allowlisted files and blocks on each finding that is left. To block, it writes the block message to stderr and exits 1, and git stops the commit.

A commit costs one Node start and the scans. A shell command that does not commit costs nothing. The [historical measurements](docs/research.md#cost) predate the staged-blob export and are not timings of the current hook.

### The binary scan

git selects the newly added files that it cannot show as text. These are the files that `betterleaks git` skips. The hook scans them with `betterleaks dir`, which reads binary files.

The hook exports each staged blob to a temporary file with a neutral name. It does not read the working-tree file, which can differ from the staged blob or be absent. The default betterleaks config exempts image, font, and office extensions from every rule, so a key in `logo.png` or a password list in `notes.xlsx` would scan clean under its own name. A binary above 100 MiB blocks unless allowlisted, to limit temporary disk use. See [The extension allowlist](docs/implementation.md#the-extension-allowlist).

## What the model and you see

When the hook blocks, the commit does not occur, and the output of `git commit` holds the block message. An agent sees it in the result of its shell call, and you see it in your terminal or git client.

A content block message names the rule, the file, the line, and the fingerprint of each finding. `--redact` keeps the secret value out of the report, the hook output, and the context of the model. The message gives the command to inspect the finding and lists the fixes in this order: remove the secret or add the file to `.gitignore`, a `betterleaks:allow` comment, a `.betterleaksignore` entry, and, as the last resort, `.agent-allow-secrets`.

A binary block message lists the paths of the files. It gives the command to inspect a file and lists the fixes: drop the file or add it to `.gitignore`, `.agent-allow-secrets`, or `AGENT_ALLOW_SECRETS`.

A passing commit gives no output from this hook unless the content scan reaches its 4 s cap. In that case, the hook writes a warning with the command to run by hand, and the commit continues.

## Settings

### Turn the hook off

The hook does not read `AGENT_HOOKS_DISABLE`. To let one file through, use an [override](#overrides). To turn the hook off:

- **One repository:** run `git config hook.block-secret-commits.enabled false` in the repository.
- **One commit of your own:** run `git commit --no-verify` in your own terminal. This also skips the other `pre-commit` and `commit-msg` hooks. dcg blocks this flag in an agent.

### The name rules

The names are in the `secret-filename` rule in [`conf/betterleaks.toml`](conf/betterleaks.toml). Edit the `path` pattern there to change what counts as a secret.

Read [Rule dialect](docs/implementation.md#rule-dialect) before you edit the pattern. Patterns are Go RE2, which has no lookahead. An incorrect pattern turns off the scan with no sign, so run `node test/check.ts` after each edit. [Name ruleset provenance](docs/research.md#name-ruleset-provenance) records where the list came from and which upstream lists were rejected.

### Per-repo configs

The hook passes `--config` only when `betterleaks config path` answers `default`, which means that nothing else selected a config. A repo with its own `.betterleaks.toml` or `.gitleaks.toml` keeps its config. Such a repo keeps the content rules and loses the name rules. Its config can extend this file to get them back:

```toml
[extend]
path = "~/.config/git/hooks/block-secret-commits/conf/betterleaks.toml"
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

| Failure                                                                                               | Result                         | What you see                              |
| ----------------------------------------------------------------------------------------------------- | ------------------------------ | ----------------------------------------- |
| `node` missing on the `PATH` of git                                                                   | Each commit blocks             | A block message that names the problem    |
| `node` older than 23.6, or `main.ts` fails                                                            | Each commit blocks             | The error text of `node`                  |
| betterleaks missing                                                                                   | betterleaks scan allows        | Nothing                                   |
| betterleaks missing                                                                                   | Each newly added binary blocks | A binary block message                    |
| Scanner error, report that does not parse, or config that does not parse                              | betterleaks scan allows        | Nothing                                   |
| betterleaks scan reaches the 4 s cap                                                                  | betterleaks scan allows        | A warning with the command to run by hand |
| `betterleaks dir` fails or reaches the cap, a staged blob cannot be read, or a binary exceeds 100 MiB | That binary blocks             | A binary block message                    |
| Git cannot list staged binaries, or an error occurs in the binary scan code                           | The commit blocks              | `the binary scan of this commit failed`   |

The hook runs on your own commits too, so a git client without `node` on its `PATH` blocks each commit. An app that you start from the macOS Dock, such as a GUI git client or an editor, can get a shorter `$PATH` than your terminal, so this block can occur there first. Put `node` on the `PATH` of that app.

The capped scan is the one fail-open path that you cannot infer from a clean run, so it gives a warning. A config error stops betterleaks, so a typo in `conf/betterleaks.toml` turns off the whole betterleaks scan with no sign. Run `node test/check.ts` after you edit that file.

## Testing

`node test/check.ts` makes real commits in throwaway repos and checks both scans and the hook command. See [docs/testing.md](docs/testing.md).

## Design notes

### Why a git hook

Before, the hook was an agent hook that read the shell command before it ran. It had these gaps, which a `pre-commit` hook does not have:

- **One call that stages and commits.** In `git add .env && git commit -m x`, the hook scanned the index before `git add` ran, so it did not see the secret.
- **`git commit -a` and `git commit <path>`.** The hook had to parse the flags from the command and scan the working tree. It missed a flag after the message, as in `git commit -m wip -a`, and did not handle `git commit <path>`.
- **Commits from a script, a `just` recipe, or a git alias.** The hook saw only the outer command.
- **Cost.** Claude Code and Codex started Node on each shell call, about 25 ms, also when the call did not commit.
- **Four agents, three adapters.** Claude Code, Codex, pi, and omp each loaded the hook in their own way.

The git hook also scans your own commits. A secret in your commit does the same damage as one in an agent's commit.

### Files

| File                          | Deployed to `~/.config/git/hooks/block-secret-commits/` | Role                                                |
| ----------------------------- | ------------------------------------------------------- | --------------------------------------------------- |
| `main.ts`                     | Yes                                                     | Both scans, block messages, and the git entry point |
| `conf/betterleaks.toml`       | Yes                                                     | The shipped betterleaks config                      |
| `README.md`, `docs/`, `test/` | No                                                      | Kept in the repo by `.chezmoiignore`                |
