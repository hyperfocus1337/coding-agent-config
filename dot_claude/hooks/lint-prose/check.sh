#!/usr/bin/env bash
# Lint prose through Vale and the rules in vale/. Prints one
# path:line:column:rule:message row per alert, exits 1 on any.
#   check.sh FILE...          check the files
#   check.sh --ext=.EXT < TEXT  check text on stdin as that file type (an Edit's text)
# Vale aborts on frontmatter that is not valid YAML, such as the unquoted
# brackets of a command's argument-hint, so each file goes in on stdin with its
# frontmatter lines blanked: the line numbers stay right.
# docs/implementation.md "Frontmatter".
set -uo pipefail
HERE=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
vale=(vale --no-global --config "$HERE/vale/vale.ini" --output=line)
[[ "${1-}" == --ext=* ]] && exec "${vale[@]}" "$1"
status=0
for f; do
  awk 'NR == 1 && /^---$/ { fm = 1 } fm { if (NR > 1 && /^---$/) fm = 0; print ""; next } 1' "$f" |
    "${vale[@]}" --path="$f" || status=1
done
exit "$status"
