# Implementation notes

Why `hook.sh` is built the way it is. `hook.sh` carries short comments that say what each section does and links here for the reasoning. [README.md](../README.md) describes the behaviour for a user of the hook; this file is for a person changing it.

This file states the decisions. [research.md](research.md) holds the measurements, the comparisons and the alternatives that lost, so a decision here reads as one paragraph and links to its evidence.

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

### Why this list exists at all

It exists for the **binary scan**, which is the one check no betterleaks-native mechanism can exempt. A content finding is covered natively for a secret value on a known line, so the block message names `.betterleaksignore` first and this list last. Prefer the native hatch: it is portable to anyone who runs betterleaks without this hook, and the list is not.

The list is still the right answer for one content case. A `secret-filename` exemption that spans directories has no native equivalent, because a fingerprint keys one file, and this list matches a bare basename anywhere. `test/test.sh` pins that case.

`.betterleaksignore` is keyed by fingerprint alone: only an exact `file:rule:line` entry suppresses anything, and a bare path or a glob matches nothing ([measured](research.md#what-betterleaksignore-accepts)). Two properties of the binary scan put it outside that keying:

- The scan hands betterleaks a **copy at a neutral name** under a fresh `mktemp -d`, for the reason in [The extension allowlist](#the-extension-allowlist). A `dir` finding does carry a fingerprint, but it carries the path it was given, so the fingerprint is `/tmp/tmp.XXXXXX/0.dat:private-key:1` and it changes on every run. Passing the real path instead would restore the fingerprint and lose the extension-allowlist defeat, which is the more valuable half.
- The fail-closed paths produce **no finding**, so there is no fingerprint to write: betterleaks missing, the file unreadable, the file staged and then removed from the worktree, or the file above `bl_copy_max` and unscannable under its own name.

`[allowlist] paths` in a `.betterleaks.toml` is the one native mechanism that is path-keyed and line-independent. It still cannot exempt a binary. The scan matches `paths` against the copy at `$stage/$i.dat`, never against the path written in the config, and the hook passes `--config` only when `betterleaks config path` answers `default`, so a repo adding that file drops the shipped rules rather than extending them.

It is also a trap for a content finding. By the precedence in [Config resolution](#config-resolution), the repo that adds it loses the name rules, and the `[extend] path` that wins them back points into a single user's home directory, so it is no more portable than this list.

The list is one newline-delimited string rather than an array, so a membership test is a single `[[ ]]` pattern match with no loop. Entries containing spaces still work, because the delimiter is a newline.

## Binary scan

### The gap

betterleaks skips a binary blob in git mode, so a keystore, a key bundle, or a database dump reaches the commit unread. A real PKCS#12 file passes `betterleaks git --staged` and is flagged by `betterleaks dir` ([measured](research.md#binary-blobs-in-git-mode)).

The name rules do not close this on their own. `pkcs12-file` is already in the upstream ruleset and still missed the file, because a rule cannot match a blob the scanner never reads.

### Why git decides which files to check

`git diff --cached --numstat` prints `-` in place of the added and deleted line counts for a blob it cannot diff as text. That is the same NUL-byte test betterleaks uses to skip a file. So the set this scan collects is, by construction, the set the staged scan could not read, with no second name list to maintain.

### Why the verdict is delegated, not assumed

Selecting that set is not the same as condemning it. An earlier version blocked every newly added binary outright, on the reasoning that an unreadable file cannot be cleared. That blocks an ordinary PNG, and it pushed every committed image, font and icon into `.claude-allow-secrets`.

`betterleaks dir` reads binaries, so the hook hands it exactly the paths git selected and blocks only on a finding. An ordinary image or a random blob passes; a binary holding a private key blocks even under an innocuous name, which no file-name rule would ever match. The earlier rejection of `dir` was measured over the whole repo and does not apply to an explicit path list. [The measurements](research.md#delegating-the-binary-verdict).

Two calls at most: one over the whole set, and a per-file loop only when that set is dirty, to name which file.

### The extension allowlist

Delegating the verdict to `betterleaks dir` is necessary but not sufficient. The default config carries a global path allowlist that exempts three extension groups from **every** rule, content rules included:

```
(?i)\.(?:bmp|gif|jpe?g|png|svg|tiff?)$
(?i)\.(?:eot|[ot]tf|woff2?)$
(?i)\.(?:docx?|xlsx?|pdf|bin|socket|vsidx|v2|suo|wsuo|dll|pdb|exe|gltf)$
```

Upstream sets these to suppress false positives on compressed bytes. The cost is that a real private key inside `logo.png` scans clean, and so does a password list inside `notes.xlsx`, which is a realistic accident in an office setting.

Only the file name decides, so the hook copies each candidate to a neutral name and scans the copy. Rule selection and a symlink were both tried and neither defeats the allowlist; a per-file `betterleaks stdin` does, but it multiplies the 4 s cap by the number of files, while one batched `dir` keeps a single bound. Scanning 300 real images, fonts and PDFs under neutral names produced no finding, so the copy does not reintroduce what the allowlist suppresses. [The measurements](research.md#defeating-the-extension-allowlist).

`bl_copy_max` (100 MB) stops the copy from dominating on large media. A file above it keeps its own path and stays exempt if its extension is listed. Closing that remainder would mean copying a file large enough to fill `/tmp`.

A fixture may use any extension, because the name no longer decides.

### Flags

`--diff-filter=A` limits the scan to newly added files. A modified tracked binary is not blocked, because it was checked when it was first added and updating a committed image or font is routine. The accepted trade-off is that swapping a secret into an already-tracked binary is not caught.

`-z` keeps a name containing a space, a quote, or a newline intact. It also rules out the extra NUL that a rename record would add, and `--diff-filter=A` excludes renames anyway.

`git commit -a` never stages an untracked file, so a newly added binary cannot arrive that way and this scan needs no `-a` equivalent.

### Failure behaviour

This is the one check that never fails open. Anything that stops a candidate being cleared blocks it: betterleaks missing, a scan error, a timeout, or a file staged and then removed from the worktree, which `dir` cannot read.

## Config resolution

### Why the file sits in `conf/`

`conf/betterleaks.toml` holds the file-name rules as a `path` rule, rather than a second matcher written in bash. It sits next to `hook.sh` rather than in `~/.config` because betterleaks has no XDG lookup ([verified](research.md#where-betterleaks-looks-for-a-config)).

Putting the file in `~/.config` would therefore imply a convention betterleaks does not follow, and a hand-run `betterleaks git --staged` would silently use different rules than this hook enforces. For a security check, manual verification disagreeing with the enforced check is the worst available failure mode.

Resolving the path from `BASH_SOURCE` also keeps the hook self-contained. A copy of the directory works anywhere with no environment set up, and the tests need no shim to point at the working tree.

### Precedence

betterleaks resolves its config in this order: `--config`, then `BETTERLEAKS_CONFIG` / `GITLEAKS_CONFIG`, then `BETTERLEAKS_CONFIG_TOML` / `GITLEAKS_CONFIG_TOML`, then a config file in the scanned directory, then the built-in defaults.

Rather than re-implement that table, the hook asks `betterleaks config path`, which answers `default` when nothing else selected a config and the file name otherwise. It passes `--config` only on `default`, so a repo carrying a gitleaks config still wins and the check cannot drift when betterleaks adds a source. Such a repo keeps the content rules and loses the name rules. Its config can extend this file to get them back:

```toml
[extend]
path = "~/.claude/hooks/block-secret-commits/conf/betterleaks.toml"
```

### Rule dialect

`path` patterns are Go RE2. RE2 has no lookahead and no backreference. A pattern using `(?!...)` does not fail softly: betterleaks exits fatal, and because the hook fails open on a scanner error, the whole scan is disabled with no visible sign. Run `bash test/test.sh` after editing the config.

A rule-scoped allowlist (`[rules.allowlist]` or `[[rules.allowlists]]`) does not suppress a `path` rule. Only the global `[allowlist]` does, and scoping the template exemption globally costs nothing ([measured](research.md#rule-dialect)).

`[extend] useDefault = true` preserves the upstream global allowlist, so the canonical AWS example key `AKIAIOSFODNN7EXAMPLE` still does not block a commit.

## Name ruleset provenance

The `secret-filename` rule is deliberately name-based rather than content-based, because a content rule matches secret values and cannot flag a file whose name is the only evidence.

Its names come from GitLab's secret-detection-rules and from talisman's filename detector, plus the common credential files. Neither upstream is consumed directly: GitLab ships no name matcher at all, and talisman's list is too loose to adopt. The useful talisman entries were imported once; this is not a synced list. [The evaluation](research.md#name-ruleset-provenance).

Encrypted blobs (`*.gpg`, `*.pgp`) and public keys (`id_rsa.pub`, `*.crt`) are not matched, because committing those is a legitimate workflow. The `id_(rsa|dsa|ecdsa|ed25519)` arm is anchored so it does not match the `.pub` sibling.

The env arm is `[^/]*\.env(\.[^/]*)?`, which accepts a prefix. It was once anchored to a leading `.env` and so missed `prod.env`, the most common production spelling; enumerating prefixes was rejected as a second name list to maintain. [How that was found](research.md#the-env-arm-missed-the-common-spelling).

## Scan cap

`bl_scan` wraps each betterleaks run in `timeout 4`.

A large high-entropy staged blob otherwise runs far past any sane hook budget: about 104 MB of base64 takes 41 s, while 20 MB of ordinary code takes 2 s, so only generated or encoded content reaches the cap ([measured](research.md#scan-cap-timings)).

Without the wrapper the hook itself is killed by the `settings.json` timeout and exits 124, which Claude Code reads as an error rather than as a block. The scan has to cap itself instead.

A capped scan allows the commit, in line with the rest of the fail-open behaviour, but it is the one fail-open path a reader cannot infer from a clean run. It prints a warning to stderr naming the command to run by hand. To fail closed instead, change that branch to `deny`.

### Do not use betterleaks' own `--timeout`

The native flag aborts the scan and reports **success**, which is indistinguishable from a clean result, so swapping to it would convert the one loud fail-open path into a silent pass. `--max-target-megabytes` is no help either; it governs `dir` scans and not git blobs. [The measurements](research.md#betterleaks-own---timeout-fails-silently).

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

The name rule earns its place because a `.pgpass` or a `.netrc` holds a human-chosen password with no entropy and no vendor prefix, so no content rule fires on it. [The measurements](research.md#why-the-name-rule-earns-its-place).

### Why not a `dir` scan

`betterleaks dir` would catch binary files directly and remove the need for the separate binary scan, but it is unusable as the only scan for two measured reasons. It does not respect `.gitignore`, which breaks the primary escape hatch. And it walks everything including `.git`, which is why it is given an explicit path list instead. [The measurements](research.md#why-not-a-dir-scan-for-everything).

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

`jq` is a hard requirement rather than a partial degradation. The block message is built from the report, so without `jq` the hook could not name the rule, the file or the line.

`--redact` keeps the secret value out of the report, the logs, the hook output, and the model's context.

### Report handling

`bl_scan` sets the global `bl_report` rather than printing, so it is not called inside a `$( )` substitution where the assignment would be lost in a subshell.

The payload is parsed for the command text only when the first scan comes back clean, so a blocking scan never pays for a `jq` it will not use. `.tool_input.command // .command` covers both hosts: Cursor passes the command flat rather than under `tool_input`. This is the same extraction as `enforce-cli-tools/hook.sh`.

Findings in an allowlisted file are dropped before the hook decides, which is what makes `.claude-allow-secrets` cover the content scan as well as the binary scan. One `jq` pass emits the filter key and the display line together, tab-separated, so the filter and the message share a single traversal.

## Cost

About 1 ms on a non-git command, which is the case that runs before every `Bash` call, and 50 ms on a clean commit. A binary adds one `betterleaks dir`, paid only when a binary is actually added. The `settings.json` timeout of 10 s covers the worst case of two capped scans on an `-a` commit. [The full table](research.md#cost).

## Changing this hook

Run both suites after any change, and after any edit to `conf/betterleaks.toml`:

```sh
bash test/test.sh
bash test/test-content.sh
```

A config error disables the betterleaks scan silently, so a green `test.sh` is the only evidence the name rules still load. See [test/README.md](../test/README.md) for what each case covers.
