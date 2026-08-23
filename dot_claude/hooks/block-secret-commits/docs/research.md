# Research notes

Measurements, comparisons and rejected alternatives behind `hook.sh`. [implementation.md](implementation.md) states each decision and links here for the evidence; this file holds the numbers and the options that lost. [../README.md](../README.md) describes the behaviour for a user of the hook.

Every measurement was taken on the installed hook with betterleaks 1.7.4. A number here is a record of one run on one machine, not a guarantee. Re-measure before you rely on a figure in a new decision.

## What `.betterleaksignore` accepts

`.betterleaksignore` is keyed by fingerprint alone. Measured against a staged file carrying a `github-pat` on line 1 and a `stripe-access-token` on line 2:

| `.betterleaksignore` entry | Findings suppressed |
| -------------------------- | ------------------- |
| `secret.env:github-pat:1`  | 1 of 2              |
| `secret.env`               | 0                   |
| `*.env`                    | 0                   |
| `**/secret.env`            | 0                   |
| `secret.env:github-pat`    | 0                   |

Only the exact `file:rule:line` form matches. A bare path, a `file:rule` pair and a glob are all accepted by the parser and then match nothing, so a wrong entry fails silently rather than erroring.

Two consequences for the hook. One entry clears one secret on one line, so a file holding five secrets needs five entries, and the line number is part of the key, so inserting a line above a secret invalidates its entry. A `secret-filename` finding is always reported on line 1, so that one does not drift.

Supports [Why this list exists at all](implementation.md#why-this-list-exists-at-all).

## Binary blobs in git mode

betterleaks skips a binary blob in git mode, so a keystore, a key bundle or a database dump reaches the commit unread. Measured on a real PKCS#12 file built with `openssl pkcs12 -export`:

| Scan                       | `real.p12`              |
| -------------------------- | ----------------------- |
| `betterleaks git --staged` | not flagged             |
| `betterleaks dir`          | flagged (`pkcs12-file`) |

The name rules do not close this on their own. `pkcs12-file` is already in the upstream ruleset and still missed the file, because a rule cannot match a blob the scanner never reads.

Supports [Binary scan](implementation.md#binary-scan).

## Delegating the binary verdict

An earlier version blocked every newly added binary outright, on the reasoning that an unreadable file cannot be cleared. That blocks an ordinary PNG, and it pushed every committed image, font and icon into `.claude-allow-secrets`.

`betterleaks dir` reads binaries, so the hook can hand it the paths git selected and block only on a finding. Measured with the shipped config:

| Path                                         | `betterleaks dir`               |
| -------------------------------------------- | ------------------------------- |
| `blob.dat` (random bytes)                    | exit 0, allowed                 |
| `pic.gif` (image)                            | exit 0, allowed                 |
| `payload.dat` (binary holding a private key) | exit 9, blocked (`private-key`) |
| `real.p12` (keystore)                        | exit 9, blocked (`pkcs12-file`) |

`payload.dat` is the case that shows the delegation earns its place: an innocuous name with a secret inside, which neither the deleted file-name list nor the `secret-filename` rule would ever match.

`dir` had been rejected earlier, measured at 1.4 s and ignoring `.gitignore`, but that was measured over the **whole repo**. Neither objection survives on an explicit path list: a gitignored file never appears in `--diff-filter=A` output, and a single-file scan costs 34 ms, paid only when a binary is actually added.

Supports [Why the verdict is delegated, not assumed](implementation.md#why-the-verdict-is-delegated-not-assumed).

## Defeating the extension allowlist

The default config carries a global path allowlist that exempts three extension groups from **every** rule, content rules included. Upstream sets these to suppress false positives on compressed bytes. The cost is that a real private key inside `logo.png` scans clean, and so does a password list inside `notes.xlsx`, which is a realistic accident in an office setting.

Only the file name decides, so the scanned path has to differ from the real one. Three ways to defeat the allowlist were measured:

| Approach                           | Finds a key in `logo.png` | Cost                                                    |
| ---------------------------------- | ------------------------- | ------------------------------------------------------- |
| `--enable-rule private-key`        | no                        | the allowlist outranks rule selection                   |
| symlink under a neutral name       | no                        | `dir` does not follow a symlink                         |
| `betterleaks stdin` per file       | yes                       | 74 ms per file, and one timeout per file instead of one |
| copy to a neutral name, then `dir` | yes                       | one batched scan, one timeout, plus the bytes copied    |

The copy wins on bulk. Twenty added binaries cost 1.48 s through `stdin` against 0.05 s through one `dir` call. The per-file timeout is the deciding point: `stdin` makes the 4 s cap apply N times, so twenty files could stall for 80 s, while the batched form keeps one 4 s bound.

### False positives from the copy

Suppressing false positives is the reason upstream ships the allowlist, so defeating it was measured against real files first. 300 real images, fonts and PDFs taken from the machine, scanned under neutral `.dat` names: **no finding**. A planted private key in the same set was found, which proves the scan ran.

### A fixture trap this removed

A test binary named `secret.bin` scanned clean while holding a real RSA key, which looked like a limit of `dir` and was not. Under the current code the name no longer decides, so a fixture may use any extension.

Supports [The extension allowlist](implementation.md#the-extension-allowlist).

## Where betterleaks looks for a config

betterleaks has no XDG lookup. Verified: with `XDG_CONFIG_HOME` pointed at a directory holding `betterleaks/betterleaks.toml`, a scan with no `--config` produced no finding, while the same scan with `--config` produced `secret-filename`.

Asking `betterleaks config path` costs 8 ms, on the commit path only.

Supports [Config resolution](implementation.md#config-resolution).

## Rule dialect

A rule-scoped allowlist (`[rules.allowlist]` or `[[rules.allowlists]]`) does not suppress a `path` rule. Only the global `[allowlist]` does. Both forms were tested and both left `.env.example` flagged.

Scoping the template exemption globally costs nothing, because the upstream config already skips those names for the content rules: identical content in a file named `decoy.txt` fires `generic-api-key`, and in `.env.example` it does not.

Supports [Rule dialect](implementation.md#rule-dialect).

## Name ruleset provenance

The names and extensions in the `secret-filename` rule come from the key-file categories in GitLab's [secret-detection-rules](https://gitlab.com/gitlab-org/security-products/secret-detection/secret-detection-rules/-/tree/main/rules/mit) and from the filename detector in [talisman](https://github.com/thoughtworks/talisman), plus the common credential files.

### Why the name rule earns its place

A content rule matches secret values and cannot flag a file whose name is the only evidence. Measured, with realistic high-entropy values where the file allowed them:

| File                                                        | Content rules alone |
| ----------------------------------------------------------- | ------------------- |
| `id_rsa`, `.git-credentials`, `.env` with an AWS-shaped key | flagged             |
| `.env` with `DB_PASSWORD=hunter2`                           | missed              |
| `.netrc` with `password s3cret`                             | missed              |
| `.pgpass` with `appuser:MyPassw0rd`                         | missed              |

A `.pgpass` or a `.netrc` holds a human-chosen password with no entropy and no vendor prefix, so no content rule fires on it.

### The env arm missed the common spelling

The arm was `\.env(\.[^/]*)?`, anchored to a name that starts with `.env`. That blocked `.env` and `.env.local` and let `prod.env`, `production.env` and `config/prod.env` through. The content rules do not cover the difference, by the table above, so the name rule was the only check and it missed the most common production spelling.

Two tests hid this. Every `prod.env` fixture carried a high-entropy token, so it blocked on content and never exercised the name rule. The README used `config/prod.env` as its example of a file needing an allowlist entry, which only makes sense if it was expected to block.

The arm is now `[^/]*\.env(\.[^/]*)?`. Enumerating prefixes was rejected: `prod`, `dev`, `staging`, `local`, `app`, `api` and the rest are unbounded, so a prefix list would be a second name list to maintain. The template allowlist gained the mirrored spelling, because `.env.example` and `example.env` are the same file to a reader.

### Why neither upstream is consumed directly

Both were evaluated as a maintained list to depend on. Neither works:

- The **GitLab ruleset** has 94 rules across 316 files and **no name or path matcher at all**. Every rule there, including the eight tagged `cryptographic_key`, is a content regex; the GCP one is `\"private_key\":\s*\"-{5}BEGIN PRIVATE KEY-{5}...`. `rules.schema.json` has no filename concept. Its rules also overlap what betterleaks already ships by default, so importing them mostly duplicates.
- **talisman** does maintain a 40-pattern filename list, which is the only such list found in a comparable tool. Its patterns are too loose to adopt as they stand: `\.?env` is unanchored, and the list treats `schema.rb`, `settings.py`, `database.yml`, `.bashrc`, `\bsql\b`, and `\bdump\b` as secret indicators. On a sample of 19 realistic file names it fired on 15, including `environment.ts`, `venv/lib/x.py`, `mysqldump.sh`, and `.env.example`, against 4 for this ruleset. Adopting it would trade maintaining a name list for maintaining a suppression list.

The non-noisy entries talisman has and GitLab does not (`*.keychain`, `*.kdb`, `*.agilekeychain`, `*.tblk`, `*.keyring`, `.s3cfg`, `.*_history`) were copied in once. That is a one-time import, not a sync.

Other tools checked and rejected as sources: `detect-secrets`, `git-secrets`, `trufflehog` and `ripsecrets` are content-only by design and carry no filename policy.

Supports [Name ruleset provenance](implementation.md#name-ruleset-provenance) and [What blocks](implementation.md#what-blocks).

## Scan cap timings

A large high-entropy staged blob runs far past any sane hook budget. Measured: about 26 MB of base64 takes 7 s, and about 104 MB takes 41 s. Ordinary source is nowhere near that, at 2 s for 20 MB of code, so only generated or encoded content reaches the 4 s cap.

`--max-target-megabytes` does not help, because it governs `dir` scans and not git blobs.

### betterleaks' own `--timeout` fails silently

Measured on a 40 MB high-entropy blob that needs 11 s unbounded:

| Approach                      | Exit code | Detected   |
| ----------------------------- | --------- | ---------- |
| `timeout 2 betterleaks ...`   | 124       | yes, warns |
| `betterleaks --timeout 2 ...` | 0         | no         |

The native flag aborts the scan and reports success, which is indistinguishable from a clean result. Swapping to it would convert the one loud fail-open path into a silent pass.

Supports [Scan cap](implementation.md#scan-cap).

## Why not a `dir` scan for everything

`betterleaks dir` would catch binary files directly and remove the need for a separate binary scan. Two measured reasons rule it out as the only scan. It does not respect `.gitignore`, which breaks the primary escape hatch. And it walks everything including `.git`, taking 1.4 s on this 118-file repo against 65 ms for a 316-file repo with a smaller object store.

Supports [Why not a `dir` scan](implementation.md#why-not-a-dir-scan).

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

The non-git row is the one that matters most, because the hook is wired to every `Bash` call.

A binary costs one extra `betterleaks dir` (about 34 ms), and a blocked one a second pass to name the offending file. Both are paid only when a binary is actually added.

betterleaks costs about 35 ms of fixed startup plus about 0.18 ms per KB of staged diff. A 50000-line (3.5 MB) diff scans in 656 ms. The `settings.json` timeout is 10 s, which covers the worst case of two capped scans on an `-a` commit.

Supports [Trigger filter](implementation.md#trigger-filter) and [Scan cap](implementation.md#scan-cap).
