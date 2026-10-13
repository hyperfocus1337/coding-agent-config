#!/usr/bin/env bash
# ~/.claude/hooks/lint-prose/hook.sh
#
# PostToolUse hook on Write, Edit, and MultiEdit: lints the prose in the
# Markdown, Org, HTML, or plain-text file Claude wrote, through check.sh and
# Vale. Not on Bash: a command names files it only reads, and a read must not
# block. Only paragraphs git reports as changed count, and each alert blocks once
# per session. Exit 2 = block the tool result and surface stderr back to Claude.
# Design notes and the rules: docs/implementation.md.

# --- Preflight ---
set -u
command -v jq >/dev/null 2>&1 || exit 0
# Run it, not `command -v`: a mise shim with no version set for this directory
# is on PATH but fails, and its error would block as if it were an alert.
vale --version >/dev/null 2>&1 || exit 0
# The same off switch as lint-all-languages: "prose" or "all" turns this off.
lint_disable=" ${CLAUDE_LINT_DISABLE:-} "
lint_disable=${lint_disable//,/ }
[[ "$lint_disable" == *" all "* || "$lint_disable" == *" prose "* ]] && exit 0
# The shared Vale config and scripts/check.sh. The test points it at the chezmoi source.
vale_dir=${LINT_PROSE_VALE_DIR:-$HOME/.config/vale}

# --- Read payload ---
payload=$(cat)
f=$(jq -r '.tool_input.file_path // empty' <<<"$payload")
# The alerts this session already blocked on. No session ID, no record: every
# alert blocks. docs/implementation.md "Once per session".
seen=''
sid=$(jq -r '.session_id // empty' <<<"$payload")
[[ "$sid" =~ ^[A-Za-z0-9_-]+$ ]] && seen=${TMPDIR:-/tmp}/lint-prose-$sid

# --- Filter ---
# A prose file that exists, and not a temp file: scratchpad prose is not project
# prose. Both sides drop /private, because macOS resolves /tmp and $TMPDIR under
# it.
[[ -f "$f" && "$f" =~ \.(md|markdown|org|html?|txt)$ ]] || exit 0
tmpdir=${TMPDIR:-/nonexistent}
tmpdir=${tmpdir#/private}
p=${f#/private}
[[ "$p" == /tmp/* || "$p" == /var/tmp/* || "$p" == "$tmpdir"* ]] && exit 0
# Vale on PATH but no config: chezmoi did not deploy ~/.config/vale here. Say
# so on exit 1, not as "Vale failed", so the fix is clear and nothing blocks.
[[ -f "$vale_dir/scripts/check.sh" ]] || {
	printf 'lint-prose: %s is missing, so the prose was not checked. Run `just chezmoi` to deploy the Vale config.\n' "$vale_dir/scripts/check.sh" 1>&2
	exit 1
}

# --- Check ---
# check.sh exits 1 on alerts and 2 when Vale fails, such as on a broken rule. A
# failure is not the prose's fault: blocking on it tells Claude to fix text that
# is fine, and dropping it reads as a clean pass. So it goes to the user on exit
# 1, which does not block. docs/implementation.md "Why it blocks".
report=''
repeats=''
failed=''
lint() { # check.sh arguments. Sets $alerts. Returns 1 on alerts, else 0.
	alerts=$(bash "$vale_dir/scripts/check.sh" "$@" 2>&1) && return 0
	[[ $? -eq 1 ]] && return 1
	failed+="lint-prose: Vale failed, so the prose was not checked:"$'\n'"$alerts"$'\n'
	alerts=''
	return 0
}

# Vale checks the whole file, and only the alerts on paragraphs that hold a line
# git reports as changed are kept, so old paragraphs do not block again on every
# write or edit. docs/implementation.md "Only the changed paragraphs".

# The lines of $1 that differ from HEAD. Fails when there is no base to compare
# to: outside git, an untracked file, or a first commit. Then every line is new.
changed_lines() {
	local dir=${1%/*}
	git -C "$dir" ls-files --error-unmatch -- "$1" >/dev/null 2>&1 || return 1
	git -C "$dir" rev-parse -q --verify "HEAD^{commit}" >/dev/null || return 1
	# A hunk header is @@ -a,b +start,count @@. A count of 0 is a deletion after
	# line start, and that line still marks its paragraph as changed.
	git -C "$dir" diff -U0 HEAD -- "$1" | awk '/^@@/ {
    split(substr($3, 2), a, ","); n = (a[2] == "" ? 1 : a[2])
    if (n == 0) print a[1]; for (i = 0; i < n; i++) print a[1] + i }'
}

if ! lint "$f"; then
	if lines=$(changed_lines "$f"); then
		# An alert names the first line of its paragraph. The paragraph runs to the
		# next blank line, so a changed line anywhere in that span keeps the alert.
		# shortcut: a tight list is one span, so a change to one item keeps the
		# alerts of every long item in that list. The upgrade is item boundaries.
		alerts=$(awk -v pre="$f:" '
      FILENAME == ARGV[1] { changed[$1]; next }
      FILENAME == ARGV[2] { blank[FNR] = ($0 ~ /^[[:space:]]*$/); last = FNR; next }
      index($0, pre) == 1 {
        split(substr($0, length(pre) + 1), p, ":")
        for (l = p[1]; l <= last && !(l > p[1] && blank[l]); l++)
          if (l in changed) { print; next }
      }' <(printf '%s\n' "$lines") "$f" - <<<"$alerts")
	fi
	# An alert is a repeat when $seen holds its file, rule, and paragraph text.
	# The text, not the line: an edit above the paragraph moves it, and an edit
	# that leaves it too long makes it new again.
	while IFS= read -r a; do
		[[ -n "$a" ]] || continue
		IFS=: read -r line _ rule _ <<<"${a#"$f:"}"
		key="$f:$rule:$(awk -v s="$line" 'NR >= s { if (NR > s && /^[[:space:]]*$/) exit; print }' "$f" | cksum)"
		if [[ -n "$seen" ]] && grep -Fxq -- "$key" "$seen" 2>/dev/null; then
			repeats+=$a$'\n'
		else
			report+=$a$'\n'
			[[ -n "$seen" ]] && printf '%s\n' "$key" >>"$seen"
		fi
	done <<<"$alerts"
fi
[[ -n "$report" ]] && { printf '%s' "$report$failed" 1>&2; exit 2; }
[[ -n "$repeats" ]] && failed="lint-prose: blocked on before in this session, so not again:"$'\n'"$repeats$failed"
[[ -n "$failed" ]] && { printf '%s' "$failed" 1>&2; exit 1; }
exit 0
