# Walkthrough: one run of `/git:commit:parallel`

This page follows one run of [`/git:commit:parallel`](../../../dot_claude/commands/git/commit/parallel.md) step by step, while a second session commits on the same branch. For why the command uses these git methods, see [parallel commits](parallel-commits.md).

The file changes, object IDs, and Git output come from the original scratch run with git 2.55.0 on 2026-10-02. The steps now explain the current Python publish helper, not the original model-driven retry loop. Internal Git calls below are an explanatory trace, not a new captured helper run.

The page shortens SHAs to 7 characters. The command uses the full SHA that git prints. Both forms work in git commands.

## Setup

The repository has one commit, `7e26956`, with two files: `lib.sh` and `README.md`. Two sessions work in the same checkout:

| Session | Changes                                                                      | Runs                                        |
| ------- | ---------------------------------------------------------------------------- | ------------------------------------------- |
| A       | `README.md`: adds a usage line. `lib.sh`: `greet` takes a name (first hunk). | `/git:commit:parallel`, traced on this page |
| B       | `lib.sh`: `shout` prints `HELLO!` (second hunk). `test.sh`: new smoke test.  | `/git:commit:parallel`, partly in step 6    |

`lib.sh` holds changes of both sessions, so session A must commit only its own hunk.

### Where git keeps state

The run changes four places. The state tables on this page show them per file.

| Place         | What it is                                                                     | Shared by sessions |
| ------------- | ------------------------------------------------------------------------------ | ------------------ |
| Working tree  | The files on disk.                                                             | Yes                |
| Shared index  | `.git/index`, the stage that `git add` and `git commit` use.                   | Yes                |
| Private index | `<dir>/index`, a stage file that only one run uses, set with `GIT_INDEX_FILE`. | No                 |
| `HEAD`        | The branch `main` and the commit it points to.                                 | Yes                |

In the state tables, `base` is the content in `7e26956`, `A` and `B` are the changes of each session, and `A+B` holds both.

## Timeline

| Step | Session A                                                       | Session B         | `main`    |
| ---- | --------------------------------------------------------------- | ----------------- | --------- |
| 1    | Reads the context, builds its lists                             |                   | `7e26956` |
| 2    | `mktemp -d`                                                     |                   | `7e26956` |
| 3    | Base `7e26956`                                                  |                   | `7e26956` |
| 4    | Builds the private index                                        |                   | `7e26956` |
| 5    | Checks the private index, saves the snapshot, starts the helper |                   | `7e26956` |
| 6    |                                                                 | Commits `test.sh` | `8fb2b41` |
| 7    | Writes commit `d638761` on base `7e26956`                       |                   | `8fb2b41` |
| 8    | `update-ref` fails: `main` moved                                |                   | `8fb2b41` |
| 9    | Reapplies the saved snapshot on `8fb2b41`, publishes `a323dfe`  |                   | `a323dfe` |
| 10   | Shared index is stale                                           |                   | `a323dfe` |
| 11   | Refresh fails on `index.lock`, then succeeds                    |                   | `a323dfe` |
| 12   | Verifies with `git status`                                      |                   | `a323dfe` |
| 13   | Prints the result                                               |                   | `a323dfe` |

## Steps

### 1. Context, lists, and group

The command loads `git status -sb`, `git diff HEAD --stat`, and `git log --oneline -5`. The status shows the changes of both sessions:

```console
$ git status -s
 M README.md
 M lib.sh
?? test.sh
```

Session A builds its lists in its reasoning and prints nothing:

- Include: `README.md` (whole file) and the `greet` hunk of `lib.sh`.
- Exclude: the `shout` hunk of `lib.sh` and `test.sh`. Session A did not make these changes.

All included changes have one concern, so session A makes one unit.

| Place        | `README.md` | `lib.sh` | `test.sh`   |
| ------------ | ----------- | -------- | ----------- |
| Working tree | A           | A+B      | B           |
| Shared index | base        | base     | not tracked |
| `HEAD`       | base        | base     | none        |

### 2. Scratch directory (step 3)

```console
$ mktemp -d
/tmp/tmp.HBASKNyFcc
```

The directory has a random name, so each run of each session gets its own. Every patch, file version, and the private index of this run go here, outside the repository.

### 3. Base (step 3.1)

```console
$ git rev-parse HEAD
7e26956a433ded3e22a330ee2348a37aed513842
```

`7e26956` is `<base>`. The next steps use this literal value. Step 3.5 moves the branch only if it still points to this commit.

### 4. Build the private index (step 3.2)

`read-tree` fills the private index with the tree of `<base>`. The file did not exist, so git creates it.

```console
$ GIT_INDEX_FILE=/tmp/tmp.HBASKNyFcc/index git read-tree 7e26956
```

`README.md` holds only changes of session A, so the whole file goes in:

```console
$ GIT_INDEX_FILE=/tmp/tmp.HBASKNyFcc/index git add -- README.md
```

`lib.sh` holds changes of both sessions. Session A writes the diff against `<base>` to a patch:

```console
$ git diff -U3 7e26956 -- lib.sh > /tmp/tmp.HBASKNyFcc/lib.patch
```

```diff
diff --git a/lib.sh b/lib.sh
index 7035b66..6568856 100755
--- a/lib.sh
+++ b/lib.sh
@@ -1,7 +1,7 @@
 #!/bin/sh

 greet() {
-  echo "hello"
+  echo "hello, $1"
 }

 # Helpers below print in upper case.
@@ -10,5 +10,5 @@ greet() {
 # Add new helpers at the end.

 shout() {
-  echo "HELLO"
+  echo "HELLO!"
 }
```

The second hunk belongs to session B. Session A copies the file header and the first hunk to a new file, `lib-greet.patch`, and applies that file to the private index:

```console
$ GIT_INDEX_FILE=/tmp/tmp.HBASKNyFcc/index git apply --cached /tmp/tmp.HBASKNyFcc/lib-greet.patch
```

`git apply` finds the hunk by its 3 context lines, so the skipped hunk does not move it.

| Place         | `README.md` | `lib.sh` | `test.sh`   |
| ------------- | ----------- | -------- | ----------- |
| Working tree  | A           | A+B      | B           |
| Shared index  | base        | base     | not tracked |
| Private index | A           | A        | none        |
| `HEAD`        | base        | base     | none        |

### 5. Check, snapshot, and start publication (steps 3.3 to 3.5)

```console
$ GIT_INDEX_FILE=/tmp/tmp.HBASKNyFcc/index git diff --cached --name-only 7e26956
README.md
lib.sh
$ GIT_INDEX_FILE=/tmp/tmp.HBASKNyFcc/index git diff --cached 7e26956 -- lib.sh
```

```diff
@@ -1,7 +1,7 @@
 #!/bin/sh

 greet() {
-  echo "hello"
+  echo "hello, $1"
 }

 # Helpers below print in upper case.
```

The private index holds only the hunks of session A. The shared index has not changed: `git diff --cached --stat` without `GIT_INDEX_FILE` prints nothing.

Session A saves the reviewed unit as an immutable binary patch with full object IDs and no rename detection:

```console
$ GIT_INDEX_FILE=/tmp/tmp.HBASKNyFcc/index git diff --cached --binary --full-index --no-renames 7e26956 > /tmp/tmp.HBASKNyFcc/unit-1.patch
```

After reading the check, session A starts publication in a new tool call:

```sh
python3 "$HOME/.claude/commands/git/commit/scripts/parallel/commit-parallel.py" /tmp/tmp.HBASKNyFcc/index 7e26956a433ded3e22a330ee2348a37aed513842 /tmp/tmp.HBASKNyFcc/unit-1.patch "feat: greet takes a name"
```

The helper rejects the shared Git index and checks that the snapshot is nonempty and matches the private-index diff against the supplied base. It saves the unit's path list for the later shared-index refresh. It then reads `HEAD`; in this example, it still sees `7e26956`.

Steps 6 through 11 show an interleaving inside that one helper call. There are no model turns between its Git operations. The helper never runs `git add`, generates a new diff from working files, or reads working-file content.

### 6. Session B commits

After the helper reads `HEAD`, session B publishes `test.sh` from its own scratch directory, `/tmp/tmp.IoeuNfjMzv`, using the same base. These are the underlying Git operations; session B also uses the publish helper:

```console
$ GIT_INDEX_FILE=/tmp/tmp.IoeuNfjMzv/index git read-tree 7e26956
$ GIT_INDEX_FILE=/tmp/tmp.IoeuNfjMzv/index git add -- test.sh
$ GIT_INDEX_FILE=/tmp/tmp.IoeuNfjMzv/index git write-tree
$ git commit-tree <tree> -p 7e26956 -m "test: add greet smoke test"
8fb2b4152e16436828197756104bcf06c84873c6
$ git update-ref -m "commit: test: add greet smoke test" HEAD 8fb2b41 7e26956
$ git reset -q -- test.sh
```

`main` now points to `8fb2b41`. The private index of session A still starts from `7e26956`, so it has no `test.sh`.

| Place              | `README.md` | `lib.sh` | `test.sh` |
| ------------------ | ----------- | -------- | --------- |
| Working tree       | A           | A+B      | B         |
| Shared index       | base        | base     | B         |
| Private index (A)  | A           | A        | none      |
| `HEAD` (`8fb2b41`) | base        | base     | B         |

### 7. The helper writes a candidate commit (inside step 3.5)

```console
$ GIT_INDEX_FILE=/tmp/tmp.HBASKNyFcc/index git write-tree
29ee4ec8ba76c16707e193f6e4fc6d9934ec8d1e
$ git commit-tree 29ee4ec -p 7e26956 -m "feat: greet takes a name"
d638761f65f0423e488f276c524a903b606821f4
```

`write-tree` stores the private index as a tree object. `commit-tree` stores a commit object with that tree and the parent `7e26956`. No branch points to `d638761` yet, so the repository looks the same as before.

### 8. The helper tries to move the branch (inside step 3.5)

```console
$ git update-ref -m "commit: feat: greet takes a name" HEAD d638761 7e26956
fatal: update_ref failed for ref 'HEAD': cannot lock ref 'HEAD': is at 8fb2b4152e16436828197756104bcf06c84873c6 but expected 7e26956a433ded3e22a330ee2348a37aed513842
```

The last argument tells `update-ref` that `main` must still point to `7e26956`. Session B moved it, so `update-ref` refuses. This failure protects the work of session B: the tree of `d638761` has no `test.sh`. If `main` had moved to `d638761`, whose parent is `7e26956`, the commit `8fb2b41` of session B would no longer be on the branch, and `test.sh` would disappear from it.

The output contains `but expected`, and the helper confirms that `HEAD` differs from its base. It waits for a random interval from 0.05 to 0.2 seconds, then retries inside the same process. Other Git errors stop publication instead of triggering a rebuild. `d638761` stays in the object database with no reference to it until Git garbage collection removes it.

### 9. The helper reapplies the saved snapshot (inside step 3.5)

```console
$ git rev-parse HEAD
8fb2b4152e16436828197756104bcf06c84873c6
$ GIT_INDEX_FILE=/tmp/tmp.HBASKNyFcc/index git read-tree 8fb2b41
$ GIT_INDEX_FILE=/tmp/tmp.HBASKNyFcc/index git apply --cached --whitespace=nowarn - < /tmp/tmp.HBASKNyFcc/unit-1.patch
$ GIT_INDEX_FILE=/tmp/tmp.HBASKNyFcc/index git write-tree
38e22ebbdf75dada8bf37e29ce019b057f8f36a2
$ git commit-tree 38e22eb -p 8fb2b41 -m "feat: greet takes a name"
a323dfe97102b59a684ea2e330d7aa8b9c73dec6
$ git update-ref -m "commit: feat: greet takes a name" HEAD a323dfe 8fb2b41
```

`read-tree` replaces the private index with the new base. The helper then applies the same reviewed bytes for both `README.md` and the `greet` hunk of `lib.sh`. The shell redirection above illustrates the patch input; the helper reads the snapshot once and passes those saved bytes to `git apply` through standard input.

No file is staged again, so a later working-tree edit cannot enter the retry. This time `main` still points to the base, so `update-ref` moves it to `a323dfe` and prints nothing. The new tree holds `test.sh` from session B because it starts from `8fb2b41`.

If the patch no longer applies cleanly, the helper stops and requires a new ownership review. It does not resolve overlapping edits automatically. Publication is limited to 10 attempts within a 30-second retry window; that window does not interrupt a Git process already running.

### 10. The shared index is stale

```console
$ git status -s
MM README.md
MM lib.sh
```

The shared index still holds the `base` content of `README.md` and `lib.sh`, but `HEAD` now holds `A`. Git compares each pair:

- First column, `HEAD` against the shared index: `M`. Git sees a staged change that removes the commit of session A.
- Second column, the shared index against the working tree: `M`. Git sees the changes of session A again as unstaged.

A `git commit` from the shared index in this state would commit the `base` content again and revert `a323dfe`.

| Place              | `README.md` | `lib.sh` | `test.sh` |
| ------------------ | ----------- | -------- | --------- |
| Working tree       | A           | A+B      | B         |
| Shared index       | base        | base     | B         |
| `HEAD` (`a323dfe`) | A           | A        | B         |

### 11. The helper refreshes the shared index (inside step 3.5)

After publication, the helper prints the commit result before it attempts the refresh:

```text
a323dfe feat: greet takes a name
```

In this example, another Git process holds the lock on the shared index at the first attempt:

```console
$ git reset -q -- README.md lib.sh
fatal: Unable to create '/tmp/tmp.v7UAAgvMon/demo/.git/index.lock': File exists.

Another git process seems to be running in this repository, or the lock file may be stale
```

The output contains `index.lock`, so the helper waits 0.2 seconds and retries. It allows at most 3 refresh attempts and never removes the lock file. The second attempt succeeds and prints nothing:

```console
$ git reset -q -- README.md lib.sh
```

`git reset -- <paths>` sets only the named paths in the shared index to their content in `HEAD`. It does not change the working tree or other paths. The helper uses the path list saved before publication.

If refresh fails, the commit already exists. The helper reports its SHA and the affected paths; session A must not publish the unit again. A non-lock refresh error stops immediately.

| Place              | `README.md` | `lib.sh` | `test.sh` |
| ------------------ | ----------- | -------- | --------- |
| Working tree       | A           | A+B      | B         |
| Shared index       | A           | A        | B         |
| `HEAD` (`a323dfe`) | A           | A        | B         |

### 12. Verify (step 4)

```console
$ git status -s
 M lib.sh
$ git diff lib.sh
```

```diff
@@ -10,5 +10,5 @@ greet() {
 # Add new helpers at the end.

 shout() {
-  echo "HELLO"
+  echo "HELLO!"
 }
```

The only uncommitted change is the `shout` hunk, which is on the exclude list. History holds both sessions in order, with one reflog entry per commit:

```console
$ git log --oneline
a323dfe feat: greet takes a name
8fb2b41 test: add greet smoke test
7e26956 chore: initial commit
$ git reflog
a323dfe HEAD@{0}: commit: feat: greet takes a name
8fb2b41 HEAD@{1}: commit: test: add greet smoke test
7e26956 HEAD@{2}: commit (initial): chore: initial commit
```

### 13. Result

Session A prints one line per commit and the count of paths that stay uncommitted:

```
`a323dfe feat: greet takes a name`
left: 1 paths
```

## Failure reporting

- If `HEAD` updates exhaust retries, report `Not committed: <reason>. Reviewed changes remain pending.` and the remaining path count. Do not report that there is nothing to commit.
- If the saved patch no longer applies, stop and review ownership before building a new unit. Do not reread and stage working files as an automatic retry.
- If publication succeeds but shared-index refresh fails, report the commit line, `Index refresh failed: <paths>`, and the remaining path count. Do not repeat the publish call blindly.

## Checks

[`test-parallel-commit.py`](../../../scripts/inspect/test-parallel-commit.py) checks the current helper in disposable repositories, including retries, snapshot validation, preservation of working files and foreign staged content, and failures after publication. It does not reproduce the historical object IDs on this page.

```sh
python3 -B scripts/inspect/test-parallel-commit.py
```

## What stays after the run

| Item                                     | Where           | Effect                                                                                |
| ---------------------------------------- | --------------- | ------------------------------------------------------------------------------------- |
| Scratch directory of each run            | `/tmp/tmp.*`    | Holds the private index, selection patches, and immutable unit snapshot. Not deleted. |
| Commit `d638761` from the failed attempt | Object database | No reference points to it. `git gc` deletes it later.                                 |
| The `shout` hunk                         | Working tree    | Session B commits it in its own run.                                                  |
