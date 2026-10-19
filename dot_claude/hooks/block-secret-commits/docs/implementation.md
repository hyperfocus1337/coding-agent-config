# Implementation notes

Why the hook is built the way it is. [`core.ts`](../core.ts) holds both scans, and its comments say what each step does. This file gives the reasons. [README.md](../README.md) describes the behaviour for a user of the hook; this file is for a person changing it.

This file states the decisions. [research.md](research.md) holds the measurements, the comparisons and the alternatives that lost, so a decision here reads as one paragraph and links to its evidence.

## Execution order

The repo root comes first, because the allowlist is a file under it and each git and betterleaks run uses it as the working folder.

The two scans run last, binary first and content second. The binary scan usually finds nothing to check and returns after one `git diff`, so ordering it first costs almost nothing and lets a blocked binary skip the staged scan entirely.

## Host contract

`check()` in the core returns a verdict: a block message, and warnings that do not block. Each adapter turns it into the form of its agent:

- **`command.ts`** (Claude Code and Codex): a block is exit 2 with the message on stderr, and the agent gives stderr to the model. A warning goes to stderr with exit 0. stdout stays empty. The settings entries run it through `guard.sh`, see [The guard](#the-guard).
- **`pi.ts`** (pi and omp): a block is `{ block: true, reason }`. A warning is a notification for the user.

The bash hook also printed a JSON verdict for Cursor on stdout. Codex reports any stdout of a command hook as a failed hook and lets the call run (tested on 2026-10-19), so the TypeScript hook prints nothing on stdout. Cursor is not a target any more.

## The guard

Claude Code and Codex block only on exit 2. Each other result lets the call run. So if `command.ts` cannot give a verdict, a commit passes with no scan and no sign. This occurs when `node` is missing from `$PATH`, is older than 23.6 and cannot run a `.ts` file, or when `command.ts` fails, for example on a payload that it cannot parse.

`guard.sh` reads the payload once and passes it to `node command.ts`. It keeps the exit code when it is 0 or 2. For each other exit code, it blocks the call when the raw payload holds a commit, with the same word test as `isCommit()`, and allows other calls. So a broken Node blocks commits only, and the message tells the user to fix `$PATH`. In this state, the raw payload test also blocks a call such as `git log --grep commit`. This is acceptable, because it occurs only while Node is broken.

The guard adds one `sh` start and one `cat` to each Bash call. The cost is too small to measure: 20 calls took 0.42 s with the guard and 0.43 s without it. `grep` runs only when `node` failed.

## Trigger filter

The hook fires on `git commit` only.

Both scans read the index. The hook runs before the command it guards, so at `git add` time the index does not yet hold the files being added and there is nothing to read. By `git commit` time it does, because the git slash commands stage and commit in the same response. Staging a secret is therefore not blocked at the moment of the `git add`; the commit that would act on it is.

`isCommit()` reads the command text. A match that is too wide does no harm, because a wrong match only runs the scans, and the scans block only on a real finding.

`commit` has to be a word of its own. A plain `*git*commit*` glob also matched the path `hooks/block-secret-commits/`, so a `git add` of a path with that word ran the content scan on an index that the command had not written yet. Whitespace must come before `commit`, which rejects `-commits` and `/commit`. A letter, a digit, `_`, or `-` after it rejects `commit-msg`. `git` and `commit` are tested apart, because flags come between them in `git -C /tmp commit`.

## Repo root

`command.ts` takes `CLAUDE_PROJECT_DIR`, then the `cwd` of the payload, then its own working folder. Codex does not set `CLAUDE_PROJECT_DIR`, so it uses the payload `cwd`. `pi.ts` takes `ctx.cwd`. Each git and betterleaks run starts in the root. If the root does not exist, no program can start, so the binary scan finds no files and the content scan finds no betterleaks: the commit is allowed.

## Allowlist overrides

Two sources feed one list, and both are additive:

- `.claude-allow-secrets` in the repo root, one entry per line, with `#` comments and blank lines skipped.
- `CLAUDE_ALLOW_SECRETS`, whitespace-separated or colon-separated, for a one-off skip that leaves no trace in the repo.

An entry matches either a repo-relative path or a bare basename. Both feed `allowed()` in the core, which is the single definition of "allowed" for the binary scan and the content scan alike, so one entry covers every check.

### Why this list exists at all

It exists for the **binary scan**, which is the one check no betterleaks-native mechanism can exempt. A content finding is covered natively for a secret value on a known line, so the block message names `.betterleaksignore` first and this list last. Prefer the native hatch: it is portable to anyone who runs betterleaks without this hook, and the list is not.

The list is still the right answer for one content case. A `secret-filename` exemption that spans directories has no native equivalent, because a fingerprint keys one file, and this list matches a bare basename anywhere. `test/check.ts` pins that case.

`.betterleaksignore` is keyed by fingerprint alone: only an exact `file:rule:line` entry suppresses anything, and a bare path or a glob matches nothing ([measured](research.md#what-betterleaksignore-accepts)). Two properties of the binary scan put it outside that keying:

- The scan hands betterleaks a **copy at a neutral name** under a fresh `mktemp -d`, for the reason in [The extension allowlist](#the-extension-allowlist). A `dir` finding does carry a fingerprint, but it carries the path it was given, so the fingerprint is `/tmp/tmp.XXXXXX/0.dat:private-key:1` and it changes on every run. Passing the real path instead would restore the fingerprint and lose the extension-allowlist defeat, which is the more valuable half.
- The fail-closed paths produce **no finding**, so there is no fingerprint to write: betterleaks missing, the file unreadable, the file staged and then removed from the worktree, or the file above `COPY_MAX` and unscannable under its own name.

`[allowlist] paths` in a `.betterleaks.toml` is the one native mechanism that is path-keyed and line-independent. It still cannot exempt a binary. The scan matches `paths` against the copy at `<temporary folder>/<n>.dat`, never against the path written in the config, and the hook passes `--config` only when `betterleaks config path` answers `default`, so a repo adding that file drops the shipped rules rather than extending them.

It is also a trap for a content finding. By the precedence in [Config resolution](#config-resolution), the repo that adds it loses the name rules, and the `[extend] path` that wins them back points into a single user's home directory, so it is no more portable than this list.

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

`COPY_MAX` (100 MiB) stops the copy from dominating on large media. A file above it keeps its own path and stays exempt if its extension is listed. Closing that remainder would mean copying a file large enough to fill `/tmp`.

A fixture may use any extension, because the name no longer decides.

### Flags

`--diff-filter=A` limits the scan to newly added files. A modified tracked binary is not blocked, because it was checked when it was first added and updating a committed image or font is routine. The accepted trade-off is that swapping a secret into an already-tracked binary is not caught.

`-z` keeps a name containing a space, a quote, or a newline intact. It also rules out the extra NUL that a rename record would add, and `--diff-filter=A` excludes renames anyway.

`git commit -a` never stages an untracked file, so a newly added binary cannot arrive that way and this scan needs no `-a` equivalent.

### Failure behaviour

This is the one check that never fails open. Anything that stops a candidate being cleared blocks it: betterleaks missing, a scan error, a timeout, or a file staged and then removed from the worktree, which `dir` cannot read.

## Config resolution

### Why the file sits in `conf/`

`conf/betterleaks.toml` holds the file-name rules as a `path` rule, rather than a second matcher in code. It sits next to `core.ts` rather than in `~/.config` because betterleaks has no XDG lookup ([verified](research.md#where-betterleaks-looks-for-a-config)).

Putting the file in `~/.config` would therefore imply a convention betterleaks does not follow, and a hand-run `betterleaks git --staged` would silently use different rules than this hook enforces. For a security check, manual verification disagreeing with the enforced check is the worst available failure mode.

`io.ts` finds the file from `import.meta.url`, which also keeps the hook self-contained. A copy of the directory works anywhere with no environment set up, and the tests need no shim to point at the working tree.

### Precedence

betterleaks resolves its config in this order: `--config`, then `BETTERLEAKS_CONFIG` / `GITLEAKS_CONFIG`, then `BETTERLEAKS_CONFIG_TOML` / `GITLEAKS_CONFIG_TOML`, then a config file in the scanned directory, then the built-in defaults.

Rather than re-implement that table, the hook asks `betterleaks config path`, which answers `default` when nothing else selected a config and the file name otherwise. It passes `--config` only on `default`, so a repo carrying a gitleaks config still wins and the check cannot drift when betterleaks adds a source. Such a repo keeps the content rules and loses the name rules. Its config can extend this file to get them back:

```toml
[extend]
path = "~/.claude/hooks/block-secret-commits/conf/betterleaks.toml"
```

### Rule dialect

`path` patterns are Go RE2. RE2 has no lookahead and no backreference. A pattern using `(?!...)` does not fail softly: betterleaks exits fatal, and because the hook fails open on a scanner error, the whole scan is disabled with no visible sign. Run `node test/check.ts` after you edit the config.

A rule-scoped allowlist (`[rules.allowlist]` or `[[rules.allowlists]]`) does not suppress a `path` rule. Only the global `[allowlist]` does, and scoping the template exemption globally costs nothing ([measured](research.md#rule-dialect)).

`[extend] useDefault = true` preserves the upstream global allowlist, so the canonical AWS example key `AKIAIOSFODNN7EXAMPLE` still does not block a commit.

## Name ruleset provenance

The `secret-filename` rule is deliberately name-based rather than content-based, because a content rule matches secret values and cannot flag a file whose name is the only evidence.

Its names come from GitLab's secret-detection-rules and from talisman's filename detector, plus the common credential files. Neither upstream is consumed directly: GitLab ships no name matcher at all, and talisman's list is too loose to adopt. The useful talisman entries were imported once; this is not a synced list. [The evaluation](research.md#name-ruleset-provenance).

Encrypted blobs (`*.gpg`, `*.pgp`) and public keys (`id_rsa.pub`, `*.crt`) are not matched, because committing those is a legitimate workflow. The `id_(rsa|dsa|ecdsa|ed25519)` arm is anchored so it does not match the `.pub` sibling.

The env arm is `[^/]*\.env(\.[^/]*)?`, which accepts a prefix. It was once anchored to a leading `.env` and so missed `prod.env`, the most common production spelling; enumerating prefixes was rejected as a second name list to maintain. [How that was found](research.md#the-env-arm-missed-the-common-spelling).

## Scan cap

Each betterleaks run gets a cap of 4 s, through the `timeout` option of `spawn` in `io.ts`, which stops the child with `SIGTERM`.

A large high-entropy staged blob otherwise runs far past any sane hook budget: about 104 MB of base64 takes 41 s, while 20 MB of ordinary code takes 2 s, so only generated or encoded content reaches the cap ([measured](research.md#scan-cap-timings)).

Without the cap, the agent stops the hook at the timeout of its settings entry, which Claude Code reads as an error and not as a block. The scan has to cap itself instead.

A capped scan allows the commit, in line with the rest of the fail-open behaviour, but it is the one fail-open path a reader cannot infer from a clean run. It prints a warning to stderr naming the command to run by hand. To fail closed instead, make `scanContent()` return a block message when `ran.timedOut` is true.

### Do not use betterleaks' own `--timeout`

The native flag aborts the scan and reports **success**, which is indistinguishable from a clean result, so swapping to it would convert the one loud fail-open path into a silent pass. `--max-target-megabytes` is no help either; it governs `dir` scans and not git blobs. [The measurements](research.md#betterleaks-own---timeout-fails-silently).

## `git commit -a`

`-a` stages tracked modifications as part of the commit itself, after this hook has run, so the index the hook reads does not hold them yet. When the command carries `-a` or `--all` and the staged scan came back clean, the hook runs a second scan with `betterleaks git --pre-commit`, which reads the unstaged tracked diff. Both scans have to be clean for the commit to proceed.

`stagesAll()` cuts the command at `-m` or `--message` before testing, so `git commit -m "add -a flag"` is not mistaken for an `-a` commit. A message glued straight to the flag (`-m"..."`) defeats that and costs one extra scan, which can block on a working-tree secret the commit would not have included. `--all` is anchored on both ends, so `--allow-empty` does not read as `--all`.

The flag test exists rather than always running both scans. Running both unconditionally would delete `stagesAll()`, but every commit would then block on an unrelated secret sitting anywhere in the dirty working tree.

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
| error in the scan code   | allow                  |
| not a git repository     | allow                  |
| config fails to parse    | allow                  |
| scan hits the 4 s cap    | allow, warns on stderr |

`--redact` keeps the secret value out of the report, the logs, the hook output, and the model's context.

### Report handling

The report is JSON on stdout (`-r -`), and the core parses it only on exit code 9. A report that does not parse throws, and the content scan then allows, as for any other scanner error.

The command is read for `-a` only when the first scan is clean, so a blocking scan never runs the second one.

Findings in an allowlisted file are dropped before the hook decides, which is what makes `.claude-allow-secrets` cover the content scan as well as the binary scan.

## Cost

In Claude Code and Codex, a command that is not a commit costs about 25 ms, which is the Node start. The bash hook took about 1 ms. This case runs before every Bash call. A clean commit also pays for the scan, about 50 ms. A binary adds one `betterleaks dir`, paid only when a binary is actually added. The `settings.json` timeout of 10 s covers the worst case of two capped scans on an `-a` commit. [The full table](research.md#cost).

## Changing this hook

Run the check after each change, and after each edit to `conf/betterleaks.toml`:

```sh
node test/check.ts
```

A config error turns off the betterleaks scan with no sign, so a passing check is the only proof that the name rules still load. See [test/README.md](../test/README.md) for what each case covers.
