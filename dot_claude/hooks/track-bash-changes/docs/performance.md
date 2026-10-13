# Performance

Measurements of the hook's time and disk cost, and of the first snapshot design that was replaced. [README.md](../README.md) describes the behavior, and [walkthrough.md](walkthrough.md) describes the code.

All values were measured on 2026-10-11 in the devcontainer: Linux on OrbStack, 10 CPUs, git 2.55.0, jq 1.7. Each value is one run, not an average, so expect a few milliseconds of noise.

## Test repos

| Repo      | Tracked files | Untracked files                               |
| --------- | ------------- | --------------------------------------------- |
| This repo | 265           | 7 small files                                 |
| Large     | 2,000         | 5 files of 20 MB random data, 100 MB in total |

The large repo is a scratch repo. Random data does not compress, so it shows the worst case for a design that stores file content.

## Hook latency

Each row is one Bash call: the time of the `PreToolUse` run and of the `PostToolUse` run, from the start of `bash hook.sh` to its exit. The times include the start of bash and jq. The Bash command between the two runs changed nothing.

| Call | This repo, pre | This repo, post | Large, pre | Large, post |
| ---- | -------------- | --------------- | ---------- | ----------- |
| 1    | 28 ms          | 18 ms           | 498 ms     | 233 ms      |
| 2    | 19 ms          | 19 ms           | 12 ms      | 11 ms       |
| 3    | 17 ms          | 17 ms           | 15 ms      | 12 ms       |
| 4    | 17 ms          | 18 ms           | 17 ms      | 14 ms       |
| 5    | 17 ms          | 18 ms           | 16 ms      | 16 ms       |

A run that stops early takes 4 ms: an empty payload, or a working directory outside a git repo. Claude Code runs the hooks of one event at the same time, so this cost overlaps with the other `PreToolUse` and `PostToolUse` hooks on Bash.

## First call of a session

The first `PreToolUse` run hashes every untracked file and every file whose stat data differs from the repo index. In the large repo, that is 100 MB, which takes 250 to 500 ms. Each later run hashes only the files that changed since the last snapshot.

The 233 ms of the first `PostToolUse` run in the large repo comes from git's racy-file check. The benchmark wrote the 100 MB a moment before the first snapshot, so the file mtimes were equal to the mtime of the new index. Git cannot trust stat data in that case, and hashes those files again at the next snapshot. A second run with file mtimes set one hour back shows the effect:

| Call | Pre    | Post  |
| ---- | ------ | ----- |
| 1    | 250 ms | 19 ms |
| 2    | 50 ms  | 21 ms |
| 3    | 35 ms  | 18 ms |

In a real session, a file that changes directly before a snapshot is small in most cases, so this second pass is cheap.

## Disk use

| Case                                    | Session directory |
| --------------------------------------- | ----------------- |
| This repo, after the 5 calls above      | 88 KB             |
| Large repo, after the 5 calls above     | 196 KB            |
| First design, large repo, after 3 calls | 96 MB             |

The current design stores only tree objects and one index per repo. The index grows with the number of files in the working tree, not with their size.

## Replaced design: a fresh index and `git add -A`

The first version took each snapshot from a new copy of the repo index, then ran `git add -A` and `git write-tree`. Its blobs went to the session object directory.

The whole hook in the large repo, measured with the loop under [Method](#method). The first design ran 3 calls, the current design 5 calls.

| Measurement                  | First design  | Current design |
| ---------------------------- | ------------- | -------------- |
| First `PreToolUse` run       | 2,251 ms      | 498 ms         |
| Each later run               | 231 to 239 ms | 11 to 17 ms    |
| Session directory at the end | 96 MB         | 196 KB         |

Before the current design went into the hook, a prototype of its snapshot ran the git commands alone in the large repo. The first snapshot took 471 ms, the next two 6 ms and 4 ms, and the object directory used 100 KB. For the first design, the git commands alone took 36 ms per snapshot in this repo.

The first design had two costs:

- **Time.** A fresh copy of the repo index has no stat data for untracked files, so `git add -A` hashed all 100 MB again in each snapshot, two times for each Bash call.
- **Disk.** `git add -A` stores each new blob. The first snapshot of each session copied all untracked files into the session directory, and nothing removed the copies.

The current design keeps one index per session and repo, so the stat data of the last snapshot stays available. `git update-index --info-only` computes blob IDs without storing the blobs, and `git write-tree --missing-ok` accepts the missing blobs. Both designs log the same `A`, `M`, and `D` lines for the same change.

## Method

The hook latency comes from this loop, run once per repo. It sends a minimal payload, because the hook reads only the five fields below.

```bash
hook=dot_claude/hooks/track-bash-changes/hook.sh
s=$(mktemp -d) # stands in for ~/.claude/projects/<project>
for i in 1 2 3 4 5; do
  p() {
    jq -n --arg e "$1" --arg c "$repo" --arg p "$s/S.jsonl" --arg t "t$i" \
      '{session_id: "S", transcript_path: $p, cwd: $c, hook_event_name: $e, tool_use_id: $t}'
  }
  a=$(date +%s%N); p PreToolUse | bash "$hook"
  b=$(date +%s%N); p PostToolUse | bash "$hook"
  c=$(date +%s%N)
  echo "call $i: pre $(((b - a) / 1000000)) ms, post $(((c - b) / 1000000)) ms"
done
du -sh "$s/S"
```

The large repo:

```bash
git init -q r && cd r
for i in $(seq 1 2000); do echo "$i" >"f$i.txt"; done
git add . && git commit -qm init
mkdir u && for i in 1 2 3 4 5; do head -c 20000000 /dev/urandom >"u/b$i.bin"; done
touch -d '1 hour ago' u/*.bin # only for the racy-file comparison
```

The prototype and the 36 ms value time only the git commands of one snapshot, without bash, jq, or the payload. For the current design, that is the index copy, `ls-files`, `update-index`, and `write-tree`. For the first design, it is the index copy, `add -A`, and `write-tree`.
