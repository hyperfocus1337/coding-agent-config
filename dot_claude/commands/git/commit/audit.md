---
allowed-tools: Bash(git status:*), Bash(git log:*), Bash(git show:*), Bash(git diff:*), Bash(git rev-parse:*), Bash(git rev-list:*), Bash(fd:*), Bash(rg:*), Bash(jq:*), Read(~/.claude/projects/**)
argument-hint: [commit SHAs or a range]
description: Check that commit commands put the right changes in each commit
---

## Context

- Status: !`git status -sb`
- Staged in the shared index: !`git diff --cached --stat`
- Recent commits: !`git log --pretty=format:'%h %s' -15`
- Unpushed: !`git rev-list --count @{upstream}..HEAD 2>/dev/null || echo "no upstream"`

## Your task

Check the commits that a commit command made, and report for each commit whether its changes belong to the session that made it. Commit nothing, stage nothing, and do not edit files.

1. **Commits.** When `$ARGUMENTS` names SHAs or a range, audit those commits. Otherwise audit every `<short sha> <subject>` line that a `/git:commit:*` command printed in this conversation. For each commit, record the owner session and the command that made it. If no commit is found, say so and stop.
   - A printed SHA that is not in `git log --pretty=format:'%h %s' -50` was rewritten by a later command, for example `extend`. Find the current commit by its subject, and the command that ran after the print. Compare `git show --stat <printed sha>` with `git show --stat <current sha>`: the same paths and line counts mean the rewrite only rebased the commit, other counts mean it folded hunks in. Audit the current commit, and record the printed SHA, the command, and the change for the History table.
2. **Transcripts.** Run `fd -t f '${CLAUDE_SESSION_ID}.jsonl' ~/.claude/projects`. Its directory holds the transcripts of every session in this repository. Read them only with `rg` and `jq`, never whole: a transcript can be several MB. Exclude your own session with `--glob '!${CLAUDE_SESSION_ID}*'`, and search only `*.jsonl` files.
   - For a commit from `$ARGUMENTS`, find the owner: `rg -l -F '<short sha>'` finds the transcript that printed it. The `<command-name>` before that line names the command. If no transcript printed it, the owner is unknown: report the commit as `unknown` and go to the next one.
   - An edit is a `tool_use` entry named `Edit` or `Write`, with `input.file_path`, and with `input.new_string` or `input.content`. A formatter or lint hook that changed a file the session edited counts as that session.
3. **Ownership.** For each commit, read `git show <sha>`. Tie every hunk to an edit of the owner session, for added lines and removed lines both. A removed line that the owner did not remove means the commit reverts the work of another session.
   - For a hunk you cannot tie, search the other transcripts: `rg -l -F -- '<path>'`, then `rg -l -F -- '<line>'` with one added or removed line of the hunk that has 20 or more characters and no quote or backslash. Transcripts store text JSON-escaped, so a line with a quote or a backslash does not match.
   - Name the session that made the hunk, or `unknown`.
4. **Completeness.** Find edits of the owner session in no audited commit. For each, run `git log --pretty=format:'%h %s' <oldest audited sha>^..HEAD -- <path>`. A commit there that is not in the audit took the change. When no commit took it, check `git diff HEAD -- <path>`: the change is still uncommitted.
5. **Grouping.** Each commit must hold one logical unit, and its Conventional Commits subject must describe all of it. A body that needs "also" means two units.
6. **Shared index.** For a `parallel` commit, a path from the context block "Staged in the shared index" that the commit touched means step 3.6 of `parallel` did not run. A later commit from the shared index reverts that commit.

Rules per command:

- `parallel`, `conversation`, `task`: a hunk of another session is an error.
- `multiple`, `single`, `push`: they take the whole working directory, so a hunk of another session is expected. List it with its session, but do not count it as an error.
- `only`: the paths the user gave are the boundary, not the session.
- `extend`: audit only the hunks that the fold added.

Give each commit one verdict:

- `ok`: all checks pass.
- `foreign`: holds hunks of another session.
- `reverts`: removes lines of another session.
- `incomplete`: another commit took its change, or it stayed uncommitted.
- `mixed`: holds two units.
- `unknown`: the owner session is not found.

Name the fix for each verdict that is not `ok`:

- `foreign`, `mixed`: `/git:commit:split` with the reason.
- `incomplete`: `/git:commit:extend` for a change still uncommitted, or `/git:commit:conversation` for several.
- `reverts`: `/git:revert` for that commit, then a new commit of the owner's own hunks.
- A commit that is already pushed: a follow-up commit instead of a history rewrite.

If you cannot decide whether a hunk belongs to the owner, say so in the report. Do not guess. If a git command fails, stop and report the error.

Print only this, with no other text. Pad each table column to its widest cell.

```
Audit of <count> commits: <count> <verdict>, <count> <verdict>

# Identified commits

| Commit      | Subject   | Command   | Verdict   |
| ----------- | --------- | --------- | --------- |
| <short sha> | <subject> | <command> | <verdict> |

# History

| Commit        | Printed as    | Rewritten by | Change   |
| ------------- | ------------- | ------------ | -------- |
| <current sha> | <printed sha> | <command>    | <change> |

# Findings

| Commit      | Path:lines         | Finding   | Owner   |
| ----------- | ------------------ | --------- | ------- |
| <short sha> | <path>:<from>-<to> | <finding> | <owner> |

# Potential fixes

| Commit      | Fix                 |
| ----------- | ------------------- |
| <short sha> | <command>, <reason> |

Uncommitted from this session:
- <path>

Shared index: <paths> still staged
```

- **Summary line:** count each verdict that occurs, `ok` first.
- **Identified commits:** one row for every audited commit, in branch order.
- **History:** one row for each rewritten commit. `<change>` is `folded <n> hunks into the commit` or `rebased onto <sha>, content unchanged`. Leave out the section when no commit was rewritten.
- **Findings:** one row for each hunk that fails a check, and for each expected hunk of another session. One commit can have several rows. Keep `<finding>` to 40 characters. `<owner>` is `this`, the first 8 characters of a session ID, or `unknown`. Leave out the section when it has no rows.
- **Potential fixes:** one row for each fix, in the order to run them. A shared index reset is a row: `git reset -q -- <paths>`, on the commit that touched the paths. A hunk you cannot tie is a row: `check <path>:<line> by hand`. Leave out the section when it has no rows.
- **Uncommitted from this session:** print `Uncommitted from this session: none` when it is empty.
- **Shared index:** print `Shared index: clean` when no audited path is staged.
