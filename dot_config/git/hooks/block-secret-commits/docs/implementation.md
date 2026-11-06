# Implementation notes

[`main.ts`](../main.ts) holds both scans and the git entry point. This file gives the reasons for the scanner design. The [README](../README.md) covers execution, overrides, and failure behavior; [research.md](research.md) records measurements and rejected alternatives.

## Git contract

Git supplies the worktree root and `GIT_INDEX_FILE`, including the temporary index used by `git commit -a`, `git commit <path>`, and `git commit --only`. The hook needs no command parser, repository discovery, agent adapter, or working-tree scan. Each child inherits that index selection.

Git blocks on any nonzero hook exit, so Node errors already block. The command in `dot_config/git/config` adds a specific message when Node is missing. Before the migration, agent hooks needed a wrapper to translate unexpected exit codes into a block. The migration reasons are in [Why a git hook](../README.md#why-a-git-hook).

## Allowlist overrides

The file and environment overrides feed one list, used by both scans. `allowed()` is the single definition of path or basename matching. The existing `.agent-allow-secrets` and `AGENT_ALLOW_SECRETS` names remain for compatibility, although this is no longer an agent hook.

### Why this list exists at all

The binary scan has no stable betterleaks fingerprint: each scan reads a neutral copy at a new temporary path. Passing the real path would restore the fingerprint but also restore the extension exclusions. Scanner errors and oversized blobs produce no finding at all, so they have no fingerprint to exempt.

For content findings, prefer betterleaks-native overrides because they also work for people without this hook. The local list still serves one content case: a `secret-filename` exemption by basename across directories. A fingerprint identifies only one file and line ([measured](research.md#what-betterleaksignore-accepts)).

A config `[allowlist] paths` entry cannot match the original binary path because the scanner sees `<temporary folder>/<n>.dat`. Adding a repo config also replaces the shipped name rules unless it explicitly extends them, see [Config resolution](#config-resolution).

## Binary scan

### The gap

betterleaks skips binary blobs in git mode. Its upstream `pkcs12-file` rule therefore misses a staged keystore, while `betterleaks dir` finds it ([measured](research.md#binary-blobs-in-git-mode)). Name rules cannot inspect a blob that the scanner skips.

### Why git decides which files to check

`git diff --cached --numstat -z --diff-filter=A` selects newly added files that git cannot diff as text. The NUL-byte test matches the binary test in betterleaks. There is no second filename list to maintain. `-z` preserves spaces, quotes, and newlines in paths.

Modified tracked binaries are deliberately excluded. Updating a committed image or font is routine; the accepted gap is that a secret inserted into an already-tracked binary is not caught.

### Which bytes are scanned

For each candidate, `git cat-file -s :<path>` reads the staged blob size. A blob above 100 MiB blocks unless allowlisted. `git cat-file blob :<path>` exports an eligible blob directly to a temporary file descriptor, without buffering it in Node or applying checkout filters.

Both commands inherit `GIT_INDEX_FILE`. Reading the working-tree path instead would scan the wrong bytes after a partially staged edit, deletion, or symlink replacement. A staged secret could then pass after the worktree file was replaced with clean content. Tests cover both directions of this mismatch and removal of the worktree file.

### Why the verdict is delegated, not assumed

Blocking every new binary would require an exemption for every image, font, and icon. `betterleaks dir` can clear ordinary binaries and find secrets under neutral names ([measured](research.md#delegating-the-binary-verdict)).

One batched call checks the exported files. If it does not succeed, one call per file identifies the paths that block. For N exported files, this is at most N + 1 scanner calls, not two calls in total. Each call has its own timeout.

### The extension allowlist

The default betterleaks config exempts image, font, and office extensions from every rule, including content rules. Exporting to numbered `.dat` files defeats that path-based exclusion. Rule selection and symlinks did not defeat it; `stdin` did, but required a separate scanner start for every file. Scanning 300 real images, fonts, and PDFs under neutral names produced no finding ([measurements](research.md#defeating-the-extension-allowlist)).

`COPY_MAX` limits each export to 100 MiB. Larger blobs block rather than falling back to their original names, which could exempt them by extension. The limit is per file, not a total temporary-disk budget. The temporary folder is removed in `finally`.

### Failure behavior

No binary candidate may pass unless the scanner clears it or the user exempts it. Missing betterleaks, an unreadable index blob, an export error, an oversized blob, a scanner error, and a timeout all block. Failure to list staged binaries also blocks, rather than treating an unknown set as empty.

## Config resolution

### Why the file sits in `conf/`

betterleaks has no XDG config lookup ([verified](research.md#where-betterleaks-looks-for-a-config)). The hook therefore resolves `conf/betterleaks.toml` relative to `import.meta.url` and passes it explicitly. The directory remains self-contained, and tests run the source without a config-path shim.

### Precedence

The hook asks `betterleaks config path` whether `--config` or an environment variable selects a config. When the answer is `default`, it passes the `.betterleaks.toml` or `.gitleaks.toml` of the repo root, else the shipped config. The betterleaks installed before 2026-11-06 loaded a config from the target path by itself. 1.10.0 does that only with `--unsafe-auto-load-config`, and the binary scan has a temporary folder as its target, so the hook looks for the repo config itself and both scans use it. Environment and repository configs lose the shipped name rules unless they extend this file, see [Per-repo configs](../README.md#per-repo-configs).

### Rule dialect

Patterns use Go RE2, which has no lookahead or backreference. An invalid pattern stops the scanner, and the content scan then fails open. Run the tests after every rule edit.

A rule-scoped allowlist does not suppress a `path` rule; only the global allowlist does. Template exemptions can be global because the upstream config already exempts those names from content rules ([measured](research.md#rule-dialect)). `[extend] useDefault = true` also preserves upstream exceptions such as the canonical AWS example key.

## Name ruleset provenance

The name rule covers files such as `.pgpass` and `.netrc` whose human-chosen passwords have no vendor prefix or useful entropy. Content rules alone miss them ([measured](research.md#why-the-name-rule-earns-its-place)).

The names came from GitLab's secret-detection categories, selected talisman filename patterns, and common credential files. Neither upstream list is consumed directly: GitLab has no name matcher, while talisman's patterns match ordinary source files. This is a one-time import, not a synced list. Encrypted files and public keys are deliberately excluded. See [the evaluation](research.md#name-ruleset-provenance).

The env pattern accepts prefixes, so `prod.env` and `.env` both match. Template exceptions cover both `.env.example` and `example.env`. An earlier pattern missed prefixed names; content-bearing test fixtures hid that gap. See [the investigation](research.md#the-env-arm-missed-the-common-spelling).

## Scan cap

Each betterleaks child gets a 4 s cap through Node's `spawn` timeout. This bounds a scanner run, not the entire hook: a dirty binary set can require per-file scans, and git operations and blob exports have no time cap.

Content timeouts allow the commit with a warning; binary timeouts block. A large high-entropy staged blob can otherwise take tens of seconds, while ordinary code scans faster ([measured](research.md#scan-cap-timings)).

### Do not use betterleaks' own `--timeout`

The native timeout exits 0 after an incomplete scan, which is indistinguishable from a clean scan. Node's external timeout keeps that distinction. `--max-target-megabytes` does not limit git blobs ([measurements](research.md#betterleaks-own---timeout-fails-silently)).

## Content scan

### What blocks

Content findings and file-name findings use the same JSON report. The block message identifies the rule, file, line, and fingerprint, without including the secret value. The name rule is needed for low-entropy credential files, see [Name ruleset provenance](#name-ruleset-provenance).

### Why not a `dir` scan

A whole-repository `dir` scan reads ignored files and `.git`, and does not represent the commit's index. It cannot replace the staged content scan. It is used only for exported binary candidates ([earlier measurements](research.md#why-not-a-dir-scan-for-everything)).

### Exit codes and fail-open

`--exit-code 9` separates findings from scanner errors, which normally exit 1. Only findings block. Missing betterleaks, invalid config, malformed JSON, and code errors allow the content scan; a timeout also warns. This policy is separate from the fail-closed binary scan.

`--redact` keeps secret values out of the report and hook output. The local allowlist filters findings before the block message is built. The message offers portable betterleaks overrides before the local list.

## Changing this hook

Run `node test/check.ts` from the hook folder after code or config changes. The tests run real commits against this source and the configured hook command, with no injected I/O adapter. See [testing.md](testing.md).
