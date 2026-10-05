#!/usr/bin/env bash
# ~/.claude/hooks/lint-prose/hook.sh
#
# PostToolUse and PostToolUseFailure hook: lints the prose in Markdown, Org,
# HTML, and plain-text files after Claude changes them, through check.sh and
# Vale. On Write/Edit the payload names the file. On Bash it names none, so the
# hook checks the paths the command text holds, and only the ones the command
# just wrote. Only paragraphs git reports as changed count. Exit 2 = block the
# tool result and surface stderr back to Claude.
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
HERE=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
# The prose extensions. .txt is added on Write/Edit only: a .txt path in a Bash
# command is often a log the command wrote, and a log with one sentence per line
# reads as one long paragraph.
exts='md|markdown|org|html?'

# --- Read payload ---
payload=$(cat)
edited_file=$(jq -r '.tool_input.file_path // empty' <<<"$payload")

candidates=()
if [[ -n "$edited_file" ]]; then
	# Write/Edit: the one file named.
	candidates+=("$edited_file")
else
	# Bash: no file named, so read the paths out of the command text instead,
	# the way lint-all-languages does, and keep the ones with a fresh mtime: a
	# path the command only read must not block it. lint-all-languages README
	# "Bash (the paths the command just wrote)".
	cwd=$(jq -r '.cwd // empty' <<<"$payload")
	[[ -n "$cwd" ]] || cwd=$PWD
	cmd=$(jq -r '.tool_input.command // empty' <<<"$payload")
	now=$(date +%s)
	while IFS= read -r path; do
		[[ "$path" == /* ]] || path=$cwd/$path
		[[ -f "$path" ]] || continue
		mtime=$(stat -c %Y "$path" 2>/dev/null || stat -f %m "$path" 2>/dev/null)
		[[ -n "$mtime" ]] || continue
		[[ $((now - mtime)) -le 120 ]] && candidates+=("$path")
	done < <(grep -oE '[^[:space:]:;|&"'"'"'`()<>=]+\.('"$exts"')\b' <<<"$cmd")
fi

# --- Filter ---
# Keep prose files that exist, drop duplicates, and skip temp files: scratchpad
# prose is not project prose. Both sides drop /private, because macOS resolves
# /tmp and $TMPDIR under it.
tmpdir=${TMPDIR:-/nonexistent}
tmpdir=${tmpdir#/private}
targets=()
for f in "${candidates[@]-}"; do
	[[ -f "$f" && "$f" =~ \.($exts|txt)$ ]] || continue
	p=${f#/private}
	[[ "$p" == /tmp/* || "$p" == /var/tmp/* || "$p" == "$tmpdir"* ]] && continue
	[[ " ${targets[*]-} " == *" $f "* ]] && continue
	targets+=("$f")
done
[[ ${#targets[@]} -gt 0 ]] || exit 0

# --- Check ---
# check.sh exits 1 on alerts and 2 when Vale fails, such as on a broken rule. A
# failure is not the prose's fault: blocking on it tells Claude to fix text that
# is fine, and dropping it reads as a clean pass. So it goes to the user on exit
# 1, which does not block. docs/implementation.md "Why it blocks".
report=''
failed=''
lint() { # check.sh arguments. Sets $alerts. Returns 1 on alerts, else 0.
	alerts=$(bash "$HERE/check.sh" "$@" 2>&1) && return 0
	[[ $? -eq 1 ]] && return 1
	failed+="lint-prose: Vale failed, so the prose was not checked:"$'\n'"$alerts"$'\n'
	alerts=''
	return 0
}

# Vale checks the whole file, and only the alerts on paragraphs that hold a line
# git reports as changed are kept, so old paragraphs do not block again on every
# write or edit. docs/implementation.md "Only the changed paragraphs".

# The lines of $1 that differ from HEAD, or from HEAD~1 when the command also
# committed. Fails when there is no base to compare to: outside git, an
# untracked file, or a first commit. Then every line is new.
changed_lines() {
	local dir=${1%/*} base=HEAD
	[[ -n "${committed:-}" ]] && base=HEAD~1
	git -C "$dir" ls-files --error-unmatch -- "$1" >/dev/null 2>&1 || return 1
	git -C "$dir" rev-parse -q --verify "$base^{commit}" >/dev/null || return 1
	# A hunk header is @@ -a,b +start,count @@. A count of 0 is a deletion after
	# line start, and that line still marks its paragraph as changed.
	git -C "$dir" diff -U0 "$base" -- "$1" | awk '/^@@/ {
    split(substr($3, 2), a, ","); n = (a[2] == "" ? 1 : a[2])
    if (n == 0) print a[1]; for (i = 0; i < n; i++) print a[1] + i }'
}

[[ -n "${cmd:-}" && "$cmd" == *"git commit"* ]] && committed=1
for f in "${targets[@]}"; do
	lint "$f" && continue
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
	report+=${alerts:+$alerts$'\n'}
done
[[ -n "$report" ]] && { printf '%s' "$report$failed" 1>&2; exit 2; }
[[ -n "$failed" ]] && { printf '%s' "$failed" 1>&2; exit 1; }
exit 0
