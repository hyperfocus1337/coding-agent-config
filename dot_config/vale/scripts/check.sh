#!/usr/bin/env bash
# Lint prose through Vale and the rules in the parent directory. Prints one
# path:line:column:rule:message row per alert. Exits 1 on an alert, and 2 when
# Vale fails, such as on a broken rule: Vale's own exit codes.
#   check.sh FILE...  check the files
# Vale aborts on frontmatter that is not valid YAML, such as the unquoted
# brackets of a command's argument-hint, so each file goes in on stdin with its
# frontmatter lines blanked: the line numbers stay right.
# dot_claude/hooks/lint-prose/docs/implementation.md "Frontmatter".
set -uo pipefail
HERE=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
vale=(vale --no-global --config "$HERE/../vale.ini" --output=line)
status=0
for f; do
  awk 'NR == 1 && /^---$/ { fm = 1 } fm { if (NR > 1 && /^---$/) fm = 0; print ""; next } 1' "$f" |
    "${vale[@]}" --path="$f"
  rc=$?
  (( rc > status )) && status=$rc
done
exit "$status"
