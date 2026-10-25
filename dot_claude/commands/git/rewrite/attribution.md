---
allowed-tools: Bash(git rebase:*), Bash(git log:*), Bash(git branch:*), Bash(git status:*), Bash(git rev-list:*), Bash(git diff:*)
description: Remove coding agent attribution from the whole branch (or the last N commits) via rebase.
argument-hint: '"Firstname Lastname <firstname.lastname@company.com>" [count|all]'
arguments: [author, count]
disable-model-invocation: true
---

## Context

- Current branch and upstream: !`git status --short --branch`
- Commits on the first-parent chain: !`git rev-list --count --first-parent HEAD`
- Recent commits (author | committer | subject | trailers): !`git log --graph --format='%h %an <%ae> | %cn <%ce> | %s | %(trailers:only,unfold,separator=; )' -15`

## Your task

Remove coding agent attribution from commits on the current branch. Set a new author, and remove the attribution lines from each message.

GitHub shows "<user> and <agent> committed" because of a co-author trailer for the agent in the message. The author field alone does not cause it. Each agent uses its own name and address, so the rewrite removes every line that starts with `Co-authored-by:` in any letter case, for any co-author.

The rewrite also removes these agent lines:

- The trailers `Assisted-by:`, `Claude-Session:`, `Amp-Thread-ID:`, `Agent-Logs-Url:`, and `Made-with:`.
- A "Generated with" line that starts with an emoji, such as `🤖 Generated with [Claude Code](…)` or `💘 Generated with Crush`. A line without an emoji, such as "Generated with protoc", stays.

The co-author rule needs no list of agents, but a human co-author also goes. When the user asks to keep the trailers, only the author changes.

An agent that is the author, such as the Copilot cloud agent, goes with the author rewrite. The committer becomes the local git identity, so an agent committer such as `Jane Doe (aider)` also goes.

### Arguments

`$author` and `$count` below are slash-command arguments, declared in the `arguments:` frontmatter and substituted before the command runs. They are not shell variables.

Arguments: `$ARGUMENTS`

- `$author` (required): new author, formatted `"Firstname Lastname <firstname.lastname@company.com>"`.
- `$count` (optional): number of commits back from HEAD to rewrite, or `all` to rewrite the entire branch from the root.

You can pass these positionally, describe them in plain language, or run the command bare. If the author is missing, ask for it. If no count was given and it is not clear the user wants the whole branch, confirm the scope (entire branch vs last N) before running.

An argument you do not pass expands to nothing, so `HEAD~\$count` becomes `HEAD~`, which git reads as `HEAD~1`. When the count is `all`, run the entire-branch command. When the count is empty, confirm the scope first. Never run a `HEAD~` with no number or with `all`.

## Safety

This rewrites history and changes every affected commit hash. Before running:

- The working tree must be clean. If `git status --short --branch` shows changes, stop and tell the user to commit or stash first.
- Tell the user that the rewrite also removes human co-authors. If Context shows a human co-author, name it.
- Tell the user that the committer name and email of every rewritten commit become the local git identity. The committer date stays the same. This also replaces `GitHub <noreply@github.com>` on merge commits made on GitHub.
- Warn the user: if these commits were already pushed, they will diverge from the remote and require a force-push. Anyone else who has the branch must reset.
- Proceed only after the user confirms.

## Commands to execute

### 1. Check the scope

`HEAD~N` exists only when N is smaller than the first-parent count in Context. When N is equal to or larger than that count, tell the user to use `all`.

### 2. Create a backup

The timestamp keeps the name unique, so an earlier backup cannot block it. The name has no `/`, because git cannot create `backup/<name>` when a branch named `backup` exists:

```bash
git branch "backup-$(git branch --show-current | tr / -)-$(date +%Y%m%d%H%M%S)" HEAD
```

Note the backup name for the verify step. To recover, run `git reset --hard <backup>`.

### 3. Rewrite

Replace `<scope>` with `--root` when `$count` is `all`, or with `HEAD~$count` when it is a number:

```bash
GIT_SEQUENCE_EDITOR=true git rebase -i --rebase-merges <scope> --exec 'dir="$(git rev-parse --git-path rebase-merge)" && orig="$(tail -n 2 "$dir/done" | head -n 1 | grep -oE "[0-9a-f]{40,}" | head -n 1)" && msg="$dir/attribution-msg" && git log -1 --format=%B > "$msg" && perl -0777 -i -pe "s/^((co-author[a-z-]*|assisted-by|claude-session|amp-thread-id|agent-logs-url|made-with):|[^\x00-\x7f]+ *generated with )[^\n]*\n?//gim" "$msg" && GIT_COMMITTER_DATE="$(git log -1 --format=%cI "$orig")" git commit -q --amend --author="$author" -F "$msg"'
```

Run it in one Bash call, with the text as written. The verify step repeats the pattern, so change both together. To keep the trailers, remove the `msg=`, `git log -1 --format=%B`, and `perl` steps, and replace `-F "$msg"` with `--no-edit`.

If the rebase stops on a conflict, run `git rebase --abort` and report the commit to the user. A merge that had a manual conflict resolution can cause this, because `--rebase-merges` merges again and does not keep the resolution.

#### How the command works

- `GIT_SEQUENCE_EDITOR=true` keeps the rebase non-interactive (no editor opens).
- `--rebase-merges` keeps merge commits such as "Merge pull request #1". Without it, the rebase flattens them away.
- Git rejects an exec command that contains a newline, so the steps stay on one line, joined with `&&`. A failed step stops the rebase.
- Each `exec` line runs right after its `pick` or `merge` line. So the second-to-last line of `done` holds the hash of the original commit. Rebase gives each new commit the current date, so the exec reads the committer date from the original commit.
- `git commit -F` cleans up whitespace, so trailing blank lines and runs of blank lines left by a removed line collapse.
- The message file is in the rebase state directory, so git deletes it when the rebase ends.

#### Blocks that the command avoids

- A hook blocks a command that holds the literal co-author trailer key, so the pattern matches `co-author[a-z-]*:` with the `i` flag.
- dcg blocks `git filter-branch` and output piped into an interpreter such as `perl`. So the message goes through a file, and `perl -i` edits that file.

### 4. Verify

1. Run `git diff <backup> HEAD`. It must print nothing. If it prints a diff, report it and recover from the backup.
2. Show the log again with the Context format: `git log --graph --format='%h %an <%ae> | %cn <%ce> | %s | %(trailers:only,unfold,separator=; )' -15`.
3. When the attribution lines were removed, this must print nothing. Use `HEAD` as `<range>` for `all`, and `HEAD~$count..HEAD` for a number:

   ```bash
   git log --oneline -i -P --grep='^((co-author[a-z-]*|assisted-by|claude-session|amp-thread-id|agent-logs-url|made-with):|[^\x00-\x7f]+ *generated with )' <range>
   ```

### 5. Push

The push is a separate step. If `git status --short --branch` in Context shows an upstream, give the exact command, for example `git push --force-with-lease origin <branch>`, and ask before you run it. Warn that branch protection on the default branch can reject a force-push. If the branch has no upstream, the rewrite is complete.
