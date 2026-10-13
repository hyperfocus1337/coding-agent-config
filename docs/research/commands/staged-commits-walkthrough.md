# Walkthrough: one run of `/git:commit:conversation` and `/git:commit:multiple`

This page follows one run of [`/git:commit:conversation`](../../../dot_claude/commands/git/commit/conversation.md) step by step, then shows where [`/git:commit:multiple`](../../../dot_claude/commands/git/commit/multiple.md) differs. Both commands, and [`/git:commit:split`](../../../dot_claude/commands/git/commit/split.md), hold the same **Commit** step: they stage each unit in the shared index and run `git commit`. For why the commands stage this way, see the [commit command implementation notes](../../../dot_claude/commands/git/commit/README.md). For the command that builds commits outside the shared index, see the [parallel walkthrough](parallel-commits-walkthrough.md).

The output comes from a scratch repository with git 2.55.0 on 2026-10-02. The page shortens SHAs to 7 characters.

## Setup

The repository has one commit, `77020db`, with three files: `lib.sh`, `README.md`, and `notes.txt`. The working directory holds changes from you and from this conversation:

| Source                               | Changes                                                                                                   |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| You, before the conversation started | `lib.sh`: `shout` prints `HELLO!`. `notes.txt`: a new todo, staged with `git add`.                        |
| This conversation, a fix             | `lib.sh`: quote the argument in `greet`.                                                                  |
| This conversation, a feature         | `lib.sh`: a new `wave` function directly below `greet`. `README.md`: a usage line for `greet` and `wave`. |

The fix and the feature touch neighboring lines in `lib.sh`, so they end up in one hunk. This makes the run use all three staging methods.

### Where git keeps state

| Place        | What it is                                                   |
| ------------ | ------------------------------------------------------------ |
| Working tree | The files on disk.                                           |
| Index        | `.git/index`, the stage that `git add` and `git commit` use. |
| `HEAD`       | The branch `main` and the commit it points to.               |

In the state tables, `base` is the content in `77020db`. `fix`, `feat`, and `you` are the changes of each source, and `+` joins them.

## Steps of `/git:commit:conversation`

### 1. Context

The command loads `git status -sb`, `git diff HEAD --stat`, and `git log --oneline -5`:

```console
$ git status -s
 M README.md
 M lib.sh
M  notes.txt
$ git diff HEAD --stat
 README.md | 2 ++
 lib.sh    | 8 ++++++--
 notes.txt | 2 +-
 3 files changed, 9 insertions(+), 3 deletions(-)
```

`M ` in the first column means that `notes.txt` is staged. ` M` in the second column means unstaged changes.

| Place        | `README.md` | `lib.sh`     | `notes.txt` |
| ------------ | ----------- | ------------ | ----------- |
| Working tree | feat        | fix+feat+you | you         |
| Index        | base        | base         | you         |
| `HEAD`       | base        | base         | base        |

### 2. Lists (step 1)

The model builds two lists in its reasoning and prints nothing. It ties each path to the action in the conversation that changed it:

- Include: the `greet` fix and the `wave` function in `lib.sh`, and `README.md`.
- Exclude: the `shout` hunk in `lib.sh` and `notes.txt`. They were changed before the conversation started.

`lib.sh` is on both lists, at hunk level.

### 3. Group (step 2)

The include list holds two concerns, so the model makes two units, the fix first:

1. `fix(lib): quote the greet argument`: one line in `lib.sh`.
2. `feat(lib): add wave`: the `wave` function in `lib.sh`, and `README.md`.

### 4. Unit 1: stage one part of a mixed hunk (step 3.1)

The model reads the diff of `lib.sh`:

```console
$ git diff -U3 -- lib.sh
```

```diff
@@ -1,7 +1,11 @@
 #!/bin/sh

 greet() {
-  echo hello $1
+  echo "hello, $1"
+}
+
+wave() {
+  echo "bye, $1"
 }

 # Helpers below print in upper case.
@@ -11,5 +15,5 @@ greet() {
 # Add new helpers at the end.

 shout() {
-  echo "HELLO"
+  echo "HELLO!"
 }
```

The first hunk mixes the fix and the feature. A patch can keep or drop a whole hunk, but it cannot split one. The model therefore uses the file version method: it writes the version of `lib.sh` that holds only the fix, outside the repository, and puts that version in the index.

```console
$ git show :lib.sh > /tmp/tmp.lIRiVVoWiu/lib.sh
```

`:lib.sh` is the index version, which is still `base`. The model edits the copy in `/tmp` so it holds only the quote fix. Then it stores the copy as a blob and points the index entry at it, with the mode of the existing entry:

```console
$ git hash-object -w /tmp/tmp.lIRiVVoWiu/lib.sh
8b7b0034081e7285e9333fda11e6cd1b1f35d428
$ git ls-files -s lib.sh
100755 fe7eaf8f70e8fe066220ff6c6bb43cabd31357c9 0	lib.sh
$ git update-index --cacheinfo 100755,8b7b003,lib.sh
```

The working tree does not change. The mode `100755` comes from `git ls-files -s`, so `lib.sh` stays executable.

| Place        | `README.md` | `lib.sh`     | `notes.txt` |
| ------------ | ----------- | ------------ | ----------- |
| Working tree | feat        | fix+feat+you | you         |
| Index        | base        | fix          | you         |
| `HEAD`       | base        | base         | base        |

### 5. Unit 1: check the stage (step 3.2)

```console
$ git diff --cached --name-only
lib.sh
notes.txt
```

The index also holds `notes.txt`, which you staged before the conversation. `git commit` takes the whole index, so without this check the fix commit would contain your todo. The model unstages it:

```console
$ git restore --staged notes.txt
$ git diff --cached --name-only
lib.sh
$ git diff --cached -- lib.sh
```

```diff
@@ -1,7 +1,7 @@
 #!/bin/sh

 greet() {
-  echo hello $1
+  echo "hello, $1"
 }

 # Helpers below print in upper case.
```

The staged diff holds only the fix, in the right place. `git restore --staged` keeps the change to `notes.txt` in the working tree, but you lose the information that you staged it.

### 6. Unit 1: commit (step 3.3)

The commit runs in a new Bash call, after the model reads the check output of step 5:

```console
$ git commit -q -m "fix(lib): quote the greet argument"
$ git log --oneline -1
7c89602 fix(lib): quote the greet argument
$ git status -s
 M README.md
 M lib.sh
 M notes.txt
```

| Place              | `README.md` | `lib.sh`     | `notes.txt` |
| ------------------ | ----------- | ------------ | ----------- |
| Working tree       | feat        | fix+feat+you | you         |
| Index              | base        | fix          | base        |
| `HEAD` (`7c89602`) | base        | fix          | base        |

### 7. Unit 2: stage whole hunks and a whole file (step 3.1)

`git diff` without a commit compares the working tree to the index. The index now holds the fix, so the diff of `lib.sh` shows only the two changes that are left:

```console
$ git diff -U3 -- lib.sh > /tmp/tmp.lIRiVVoWiu/lib.patch
```

```diff
diff --git a/lib.sh b/lib.sh
index 8b7b003..9b39204 100755
--- a/lib.sh
+++ b/lib.sh
@@ -4,6 +4,10 @@ greet() {
   echo "hello, $1"
 }

+wave() {
+  echo "bye, $1"
+}
+
 # Helpers below print in upper case.
 # They take no arguments.
 # Keep them short.
@@ -11,5 +15,5 @@ greet() {
 # Add new helpers at the end.

 shout() {
-  echo "HELLO"
+  echo "HELLO!"
 }
```

The second hunk is yours, from before the conversation. The model finds the `wave` hunk by its text, not by its start line, and copies the file header and that hunk to a new file, `lib-wave.patch`, and applies that file to the index. If the copy fails, `lib-wave.patch` does not exist and `git apply` stops with an error, so it cannot stage the full diff in `lib.patch`. `README.md` holds only the feature, so the whole file goes in:

```console
$ git apply --cached /tmp/tmp.lIRiVVoWiu/lib-wave.patch
$ git add README.md
```

`git apply` finds the hunk by its 3 context lines, so the skipped hunk does not move it.

### 8. Unit 2: check and commit (steps 3.2 and 3.3)

```console
$ git diff --cached --name-only
README.md
lib.sh
$ git diff --cached -- lib.sh
```

```diff
@@ -4,6 +4,10 @@ greet() {
   echo "hello, $1"
 }

+wave() {
+  echo "bye, $1"
+}
+
 # Helpers below print in upper case.
 # They take no arguments.
 # Keep them short.
```

The model reads this output, then commits in a new Bash call:

```console
$ git commit -q -m "feat(lib): add wave"
```

| Place              | `README.md` | `lib.sh`     | `notes.txt` |
| ------------------ | ----------- | ------------ | ----------- |
| Working tree       | feat        | fix+feat+you | you         |
| Index              | feat        | fix+feat     | base        |
| `HEAD` (`12cb4e2`) | feat        | fix+feat     | base        |

### 9. Verify (step 4)

```console
$ git status -s
 M lib.sh
 M notes.txt
$ git log --oneline
12cb4e2 feat(lib): add wave
7c89602 fix(lib): quote the greet argument
77020db chore: initial commit
```

Both uncommitted paths are on the exclude list: the `shout` hunk and `notes.txt`. The command prints:

```
`7c89602 fix(lib): quote the greet argument`
`12cb4e2 feat(lib): add wave`
left: 2 paths
```

## Where `/git:commit:multiple` differs

`multiple` starts from the same state and runs the same **Commit** step, but it takes every change in the working directory, including your changes from before the conversation. The same run with `multiple` makes four commits:

```console
$ git log --oneline
b32cc9f docs(notes): add tests to the todo list
1619565 feat(lib): emphasize shout
12cb4e2 feat(lib): add wave
7c89602 fix(lib): quote the greet argument
77020db chore: initial commit
$ git status -s
```

The first two units are the same as in steps 4 to 8. The check of unit 1 also unstages `notes.txt`, because the file is not part of that unit. After unit 2, the remaining files each hold one unit, so `git add lib.sh` and `git add notes.txt` stage them whole.

| Step   | `conversation`                                                                                               | `multiple`                                                                              |
| ------ | ------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| Lists  | Builds an include list and an exclude list from the conversation.                                            | No lists. Every change is in scope.                                                     |
| Group  | Groups the include list by concern, foundational changes first. A fix on its own initiative is its own unit. | Groups all changes by concern, foundational changes first.                              |
| Stage  | Same three methods.                                                                                          | Same three methods.                                                                     |
| Check  | Reads `git diff --cached` for every staged file. Every hunk must be in the unit.                             | Reads `git diff --cached` only for partly staged files. Every hunk must be in the unit. |
| Commit | Conventional Commits. A body that needs "also" means the unit must split.                                    | Conventional Commits.                                                                   |
| End    | `git status` shows only exclude paths.                                                                       | `git status` is clean.                                                                  |
| Output | One line per commit, plus `left: <count> paths`.                                                             | One line per commit.                                                                    |

## Problems the run shows

### Neighboring changes merge into one hunk

`git diff -U3` merges two changes into one hunk when 6 or fewer unchanged lines separate them. In a first version of this scenario, 6 lines separated the `wave` function from the `shout` change. The diff in step 7 then had one hunk that held both, and a patch that kept the `wave` hunk also committed your `shout` change. The setup above has 7 lines between the two changes, so they stay separate.

When the hunk you need also holds a change of another unit, use the file version method from step 4, not the patch method. The check in step 3.2 catches a wrong patch: it reads every staged hunk before the commit.

### The check runs too late in one Bash call

The check protects the commit only when the model reads it before `git commit` runs. In one real session, one Bash call held the hunk split, `git apply --cached`, the check, and the commits of two units. The split matched no hunk, because it took start lines from a `-U1` diff and the patch came from `-U3`. `git apply` failed, the next line staged the whole file, and both units went into one commit, `6cec8a04`.

The commands now put each commit in a new Bash call, after the check, and pick hunks by their text. The fix of that commit then used `git apply --unidiff-zero`, which can place a hunk in the wrong spot (see [avoided methods](../../../dot_claude/commands/git/commit/README.md#avoided)), so the commands also forbid it.

### The check unstages what you staged

`git commit` takes the whole index. Step 3.2 is the only protection against a commit that takes changes the unit does not own, such as `notes.txt` in step 5. It unstages them with `git restore --staged`. The change stays in the working tree, but your stage is gone after the run.

### One index for all sessions

The whole method depends on one index that only this session writes between `git add` and `git commit`. Two cases break that:

- Another session stages in the same checkout. Its hunks are in the index when this session commits. Step 3.2 can catch a staged path that does not belong to the unit, but not a hunk that another session stages after the check. For that case, use [`/git:commit:parallel`](../../../dot_claude/commands/git/commit/parallel.md).
- An editor that refreshes git status holds `.git/index.lock` for a moment. A git command then fails, and the command stops instead of staging on a wrong state. See [checks](../../../dot_claude/commands/git/commit/README.md#checks).
