# Implementation notes

Why `hook.sh` is built the way it is. `hook.sh` carries short comments that say what each section does and links here for the reasoning. [README.md](../README.md) describes the behaviour for a user of the hook; this file is for a person changing it.

Every measurement below was taken on the installed hook with betterleaks 1.7.4.

## Execution order

Two orderings are load-bearing and must not be rearranged:

1. The stdin read has to precede the `jq` that parses the payload. The payload arrives once on stdin and cannot be read twice.
2. The repo root has to precede both the allowlist that reads a file under it and every git command, which must run inside the repository.

The two scans run last, binary first and content second. The binary scan usually finds nothing to check and returns after one `git diff`, so ordering it first costs almost nothing and lets a blocked binary skip the staged scan entirely.

## Host contract

The hook serves two hosts with one exit path.

Cursor's `beforeShellExecution` hook requires valid JSON on stdout. Empty stdout is rejected as "not valid JSON" and blocks the command, so every exit path must print something. Claude Code ignores the unknown `permission` field and decides on the exit code alone: 0 proceeds, 2 blocks. Printing the Cursor verdict and exiting with the Claude code satisfies both at once.

`deny` takes a static string. A filename containing a `"` or a newline would malform the JSON, and Cursor fails open on bad JSON, so a file with an awkward name would silently defeat the block. The exact paths go to stderr instead, which Claude Code feeds back to the model as the block reason.

## Trigger filter

The hook fires on `git commit` only.

Both scans read the index. The hook runs before the command it guards, so at `git add` time the index does not yet hold the files being added and there is nothing to read. By `git commit` time it does, because the git slash commands stage and commit in the same response. Staging a secret is therefore not blocked at the moment of the `git add`; the commit that would act on it is.

The filter matches the command text inside the raw JSON payload rather than parsing it. Matching too widely is harmless, because a wrong match only runs the scans, and those block on a real finding alone.

`commit` has to be a word of its own. A plain `*git*commit*` glob also matched the literal path `hooks/block-secret-commits/`, so a `git add` on any path holding that word ran the commit-only content scan against an index the command had not written yet. Requiring whitespace in front rejects `-commits` and `/commit` alike, and rejecting a trailing word character rejects `commit-msg`. `git` and `commit` are tested apart, because flags sit between them in `git -C /tmp commit`.

## Repo root

`CLAUDE_PROJECT_DIR` names the project directory, and the hook falls back to `$PWD` when Claude did not set it. Both scans run git and betterleaks against the current directory, so the hook moves there first. A failed `cd` means there is no such directory, which allows.

## Allowlist overrides

Two sources feed one list, and both are additive:

- `.claude-allow-secrets` in the repo root, one entry per line, with `#` comments and blank lines skipped.
- `CLAUDE_ALLOW_SECRETS`, whitespace-separated or colon-separated, for a one-off skip that leaves no trace in the repo.

An entry matches either a repo-relative path or a bare basename. Both feed `is_allowed`, which is the single definition of "allowed" for the binary scan and the content scan alike, so one entry covers every check.

This list exists rather than deferring to betterleaks' own allowlisting for two reasons. A finding from `betterleaks dir` carries an **empty** `Fingerprint`, so `.betterleaksignore`, which is fingerprint-keyed, cannot exempt anything the binary scan reports. And a repo that adds a `.betterleaks.toml` to allowlist a path loses the name rules entirely, by the precedence described in [Config resolution](#config-resolution), which makes the obvious native alternative a trap.

The list is one newline-delimited string rather than an array, so a membership test is a single `[[ ]]` pattern match with no loop. Entries containing spaces still work, because the delimiter is a newline.

## Binary scan

### The gap

betterleaks skips a binary blob in git mode, so a keystore, a key bundle, or a database dump reaches the commit unread. Measured on a real PKCS#12 file built with `openssl pkcs12 -export`:

| Scan                       | `real.p12`              |
| -------------------------- | ----------------------- |
| `betterleaks git --staged` | not flagged             |
| `betterleaks dir`          | flagged (`pkcs12-file`) |

The name rules do not close this on their own. `pkcs12-file` is already in the upstream ruleset and still missed the file, because a rule cannot match a blob the scanner never reads.

### Why git decides which files to check

`git diff --cached --numstat` prints `-` in place of the added and deleted line counts for a blob it cannot diff as text. That is the same NUL-byte test betterleaks uses to skip a file. So the set this scan collects is, by construction, the set the staged scan could not read, with no second name list to maintain.

### Why the verdict is delegated, not assumed

Selecting that set is not the same as condemning it. An earlier version blocked every newly added binary outright, on the reasoning that an unreadable file cannot be cleared. That blocks an ordinary PNG, and it pushed every committed image, font and icon into `.claude-allow-secrets`.

`betterleaks dir` reads binaries, so the hook hands it exactly the paths git selected and blocks only on a finding. Measured with the shipped config:

| Path                                         | `betterleaks dir`               |
| -------------------------------------------- | ------------------------------- |
| `blob.dat` (random bytes)                    | exit 0, allowed                 |
| `pic.gif` (image)                            | exit 0, allowed                 |
| `payload.dat` (binary holding a private key) | exit 9, blocked (`private-key`) |
| `real.p12` (keystore)                        | exit 9, blocked (`pkcs12-file`) |

`payload.dat` is the case that shows the delegation earns its place: an innocuous name with a secret inside, which neither the deleted file-name list nor the `secret-filename` rule would ever match.

The earlier rejection of `dir` (measured at 1.4 s and ignoring `.gitignore`) was measured over the **whole repo**. Neither objection survives on an explicit path list: a gitignored file never appears in `--diff-filter=A` output, and a single-file scan costs 34 ms, paid only when a binary is actually added.

Two calls at most: one over the whole set, and a per-file loop only when that set is dirty, to name which file.

### The extension allowlist

Delegating the verdict to `betterleaks dir` is necessary but not sufficient. The default config carries a global path allowlist that exempts three extension groups from **every** rule, content rules included:

```
(?i)\.(?:bmp|gif|jpe?g|png|svg|tiff?)$
(?i)\.(?:eot|[ot]tf|woff2?)$
(?i)\.(?:docx?|xlsx?|pdf|bin|socket|vsidx|v2|suo|wsuo|dll|pdb|exe|gltf)$
```

Upstream sets these to suppress false positives on compressed bytes. The cost is that a real private key inside `logo.png` scans clean, and so does a password list inside `notes.xlsx`, which is a realistic accident in an office setting.

Three ways to defeat the allowlist were measured. Only the file name decides, so the scanned path has to differ from the real one:

| Approach                           | Finds a key in `logo.png` | Cost                                                    |
| ---------------------------------- | ------------------------- | ------------------------------------------------------- |
| `--enable-rule private-key`        | no                        | the allowlist outranks rule selection                   |
| symlink under a neutral name       | no                        | `dir` does not follow a symlink                         |
| `betterleaks stdin` per file       | yes                       | 74 ms per file, and one timeout per file instead of one |
| copy to a neutral name, then `dir` | yes                       | one batched scan, one timeout, plus the bytes copied    |

The copy wins on bulk. Twenty added binaries cost 1.48 s through `stdin` against 0.05 s through one `dir` call. The per-file timeout is the deciding point: `stdin` makes the 4 s cap apply N times, so twenty files could stall for 80 s, while the batched form keeps one 4 s bound.

`bl_copy_max` (100 MB) stops the copy from dominating on large media. A file above it keeps its own path and stays exempt if its extension is listed. Closing that remainder would mean copying a file large enough to fill `/tmp`.

False positives were measured before the change, because suppressing them is the reason upstream ships the allowlist. 300 real images, fonts, and PDFs taken from the machine, scanned under neutral `.dat` names: **no finding**. A planted private key in the same set was found, which proves the scan ran.

This also removes a fixture trap that cost time earlier. A test binary named `secret.bin` scanned clean while holding a real RSA key, which looked like a limit of `dir` and was not. Under the current code the name no longer decides, so a fixture may use any extension.

### Flags

`--diff-filter=A` limits the scan to newly added files. A modified tracked binary is not blocked, because it was checked when it was first added and updating a committed image or font is routine. The accepted trade-off is that swapping a secret into an already-tracked binary is not caught.

`-z` keeps a name containing a space, a quote, or a newline intact. It also rules out the extra NUL that a rename record would add, and `--diff-filter=A` excludes renames anyway.

`git commit -a` never stages an untracked file, so a newly added binary cannot arrive that way and this scan needs no `-a` equivalent.

### Failure behaviour

This is the one check that never fails open. Anything that stops a candidate being cleared blocks it: betterleaks missing, a scan error, a timeout, or a file staged and then removed from the worktree, which `dir` cannot read.

## Config resolution

### Why the file sits in `conf/`

`conf/betterleaks.toml` holds the file-name rules as a `path` rule, rather than a second matcher written in bash. It sits next to `hook.sh` rather than in `~/.config` because betterleaks has no XDG lookup. Verified: with `XDG_CONFIG_HOME` pointed at a directory holding `betterleaks/betterleaks.toml`, a scan with no `--config` produced no finding, while the same scan with `--config` produced `secret-filename`.

Putting the file in `~/.config` would therefore imply a convention betterleaks does not follow, and a hand-run `betterleaks git --staged` would silently use different rules than this hook enforces. For a security check, manual verification disagreeing with the enforced check is the worst available failure mode.

Resolving the path from `BASH_SOURCE` also keeps the hook self-contained. A copy of the directory works anywhere with no environment set up, and the tests need no shim to point at the working tree.

### Precedence

betterleaks resolves its config in this order: `--config`, then `BETTERLEAKS_CONFIG` / `GITLEAKS_CONFIG`, then `BETTERLEAKS_CONFIG_TOML` / `GITLEAKS_CONFIG_TOML`, then a config file in the scanned directory, then the built-in defaults.

Rather than re-implement that table, the hook asks `betterleaks config path`, which answers `default` when nothing else selected a config and the file name otherwise. It passes `--config` only on `default`, so a repo carrying a gitleaks config still wins and the check cannot drift when betterleaks adds a source. The call costs 8 ms, on the commit path only. Such a repo keeps the content rules and loses the name rules. Its config can extend this file to get them back:

```toml
[extend]
path = "~/.claude/hooks/block-secret-commits/conf/betterleaks.toml"
```

### Rule dialect

`path` patterns are Go RE2. RE2 has no lookahead and no backreference. A pattern using `(?!...)` does not fail softly: betterleaks exits fatal, and because the hook fails open on a scanner error, the whole scan is disabled with no visible sign. Run `bash test/test.sh` after editing the config.

A rule-scoped allowlist (`[rules.allowlist]` or `[[rules.allowlists]]`) does not suppress a `path` rule. Only the global `[allowlist]` does. Both forms were tested and both left `.env.example` flagged. Scoping the template exemption globally costs nothing, because the upstream config already skips those names for the content rules: identical content in a file named `decoy.txt` fires `generic-api-key`, and in `.env.example` it does not.

`[extend] useDefault = true` preserves the upstream global allowlist, so the canonical AWS example key `AKIAIOSFODNN7EXAMPLE` still does not block a commit.

## Name ruleset provenance

The `secret-filename` rule is deliberately name-based rather than content-based. Its names and extensions come from the key-file categories in GitLab's [secret-detection-rules](https://gitlab.com/gitlab-org/security-products/secret-detection/secret-detection-rules/-/tree/main/rules/mit) and from the filename detector in [talisman](https://github.com/thoughtworks/talisman), plus the common credential files.

Encrypted blobs (`*.gpg`, `*.pgp`) and public keys (`id_rsa.pub`, `*.crt`) are not matched, because committing those is a legitimate workflow. The `id_(rsa|dsa|ecdsa|ed25519)` arm is anchored so it does not match the `.pub` sibling.

### Why the env arm accepts a prefix

The arm was `\.env(\.[^/]*)?`, anchored to a name that starts with `.env`. That blocked `.env` and `.env.local` and let `prod.env`, `production.env`, and `config/prod.env` through. The content rules do not cover the difference: an env file holds `DB_PASSWORD=hunter2`, which has no entropy and no vendor prefix, so nothing fires on it. The name rule is the only check, and it missed the most common production spelling.

Two tests hid this. Every `prod.env` fixture carried a high-entropy token, so it blocked on content and never exercised the name rule. The README used `config/prod.env` as its example of a file needing an allowlist entry, which only makes sense if it was expected to block.

The arm is now `[^/]*\.env(\.[^/]*)?`. Enumerating prefixes was rejected: `prod`, `dev`, `staging`, `local`, `app`, `api` and the rest are unbounded, so a prefix list would be a second name list to maintain. The template allowlist gained the mirrored spelling, because `.env.example` and `example.env` are the same file to a reader.

### Why neither upstream is consumed directly

Both were evaluated as a maintained list to depend on. Neither works:

- The **GitLab ruleset** has 94 rules across 316 files and **no name or path matcher at all**. Every rule there, including the eight tagged `cryptographic_key`, is a content regex; the GCP one is `\"private_key\":\s*\"-{5}BEGIN PRIVATE KEY-{5}...`. `rules.schema.json` has no filename concept. Its rules also overlap what betterleaks already ships by default, so importing them mostly duplicates.
- **talisman** does maintain a 40-pattern filename list, which is the only such list found in a comparable tool. Its patterns are too loose to adopt as they stand: `\.?env` is unanchored, and the list treats `schema.rb`, `settings.py`, `database.yml`, `.bashrc`, `\bsql\b`, and `\bdump\b` as secret indicators. On a sample of 19 realistic file names it fired on 15, including `environment.ts`, `venv/lib/x.py`, `mysqldump.sh`, and `.env.example`, against 4 for this ruleset. Adopting it would trade maintaining a name list for maintaining a suppression list.

The non-noisy entries talisman has and GitLab does not (`*.keychain`, `*.kdb`, `*.agilekeychain`, `*.tblk`, `*.keyring`, `.s3cfg`, `.*_history`) were copied in once. That is a one-time import, not a sync.

Other tools checked and rejected as sources: `detect-secrets`, `git-secrets`, `trufflehog`, and `ripsecrets` are content-only by design and carry no filename policy.

## Scan cap

`bl_scan` wraps each betterleaks run in `timeout 4`.

A large high-entropy staged blob otherwise runs far past any sane hook budget. Measured: about 26 MB of base64 takes 7 s, and about 104 MB takes 41 s. Ordinary source is nowhere near that, at 2 s for 20 MB of code, so only generated or encoded content reaches the cap.

Without the wrapper the hook itself is killed by the `settings.json` timeout and exits 124, which Claude Code reads as an error rather than as a block. The scan has to cap itself instead. `--max-target-megabytes` does not help, because it governs `dir` scans and not git blobs.

A capped scan allows the commit, in line with the rest of the fail-open behaviour, but it is the one fail-open path a reader cannot infer from a clean run. It prints a warning to stderr naming the command to run by hand. To fail closed instead, change that branch to `deny`.

### Do not use betterleaks' own `--timeout`

Measured on a 40 MB high-entropy blob that needs 11 s unbounded:

| Approach                      | Exit code | Detected   |
| ----------------------------- | --------- | ---------- |
| `timeout 2 betterleaks ...`   | 124       | yes, warns |
| `betterleaks --timeout 2 ...` | 0         | no         |

The native flag aborts the scan and reports success, which is indistinguishable from a clean result. Swapping to it would convert the one loud fail-open path into a silent pass.

`$bl` holds the resolved binary path from `command -v`, so `timeout` skips its own PATH walk.

## `git commit -a`

`-a` stages tracked modifications as part of the commit itself, after this hook has run, so the index the hook reads does not hold them yet. When the command carries `-a` or `--all` and the staged scan came back clean, the hook runs a second scan with `betterleaks git --pre-commit`, which reads the unstaged tracked diff. Both scans have to be clean for the commit to proceed.

`stages_all` truncates the command at `-m` or `--message` before testing, so `git commit -m "add -a flag"` is not mistaken for an `-a` commit. A message glued straight to the flag (`-m"..."`) defeats that and costs one extra scan, which can block on a working-tree secret the commit would not have included. `--all` is anchored on both ends, so `--allow-empty` does not read as `--all`.

The flag test exists rather than always running both scans. Running both unconditionally would delete `stages_all` and the payload extraction, about 14 lines, but every commit would then block on an unrelated secret sitting anywhere in the dirty working tree.

## Content scan

### What blocks

Two kinds of finding block, and the block message says which is which:

- a content rule matched a secret value on a line, for example `generic-api-key` or `github-pat`;
- the `secret-filename` rule matched the file name alone.

The name rule earns its place because a content rule matches secret values and cannot flag a file whose name is the only evidence. Measured, with realistic high-entropy values where the file allowed them:

| File                                                        | Content rules alone |
| ----------------------------------------------------------- | ------------------- |
| `id_rsa`, `.git-credentials`, `.env` with an AWS-shaped key | flagged             |
| `.env` with `DB_PASSWORD=hunter2`                           | missed              |
| `.netrc` with `password s3cret`                             | missed              |
| `.pgpass` with `appuser:MyPassw0rd`                         | missed              |

A `.pgpass` or a `.netrc` holds a human-chosen password with no entropy and no vendor prefix, so no content rule fires on it.

### Why not a `dir` scan

`betterleaks dir` would catch binary files directly and remove the need for the separate binary scan, but it is unusable here for two measured reasons. It does not respect `.gitignore`, which breaks the primary escape hatch. And it walks everything including `.git`, taking 1.4 s on this 118-file repo against 65 ms for a 316-file repo with a smaller object store.

### Exit codes and fail-open

`--exit-code 9` separates "leaks found" from betterleaks' own error exit of 1. Without it, a broken scan would block every commit instead of allowing it.

| Condition                | Result                 |
| ------------------------ | ---------------------- |
| finding, not allowlisted | block                  |
| clean scan               | allow                  |
| betterleaks missing      | allow                  |
| `jq` missing             | allow                  |
| not a git repository     | allow                  |
| config fails to parse    | allow                  |
| scan hits the 4 s cap    | allow, warns on stderr |

`jq` is a hard requirement rather than a partial degradation. The allowlist filter runs on the report, so without `jq` a file listed in `.claude-allow-secrets` would still block, contradicting the escape hatch the block message names.

`--redact` keeps the secret value out of the report, the logs, the hook output, and the model's context.

### Report handling

`bl_scan` sets the global `bl_report` rather than printing, so it is not called inside a `$( )` substitution where the assignment would be lost in a subshell.

The payload is parsed for the command text only when the first scan comes back clean, so a blocking scan never pays for a `jq` it will not use. `.tool_input.command // .command` covers both hosts: Cursor passes the command flat rather than under `tool_input`. This is the same extraction as `enforce-cli-tools/hook.sh`.

Findings in an allowlisted file are dropped before the hook decides, which is what makes `.claude-allow-secrets` cover the content scan as well as the binary scan. One `jq` pass emits the filter key and the display line together, tab-separated, so the filter and the message share a single traversal.

## Cost

Median of 9 runs on the installed hook:

| Command                                       | Hook cost |
| --------------------------------------------- | --------- |
| any non-git command                           | 1 ms      |
| `git commit`, clean 1000-line staged diff     | 50 ms     |
| `git commit -am`, clean (runs both scans)     | 69 ms     |
| `git commit`, innocent binary added           | 79 ms     |
| `git commit`, secret binary blocked           | 139 ms    |
| `git commit`, staged content past the 4 s cap | 4040 ms   |

A binary costs one extra `betterleaks dir` (about 34 ms), and a blocked one a second pass to name the offending file. Both are paid only when a binary is actually added.

betterleaks costs about 35 ms of fixed startup plus about 0.18 ms per KB of staged diff. A 50000-line (3.5 MB) diff scans in 656 ms. The `settings.json` timeout is 10 s, which covers the worst case of two capped scans on an `-a` commit.

## Changing this hook

Run both suites after any change, and after any edit to `conf/betterleaks.toml`:

```sh
bash test/test.sh
bash test/test-content.sh
```

A config error disables the betterleaks scan silently, so a green `test.sh` is the only evidence the name rules still load. See [test/README.md](../test/README.md) for what each case covers.
