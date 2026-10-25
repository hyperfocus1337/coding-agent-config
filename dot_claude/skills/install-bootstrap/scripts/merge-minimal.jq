# Merge the keys of settings-minimal.json that change behavior into a repo's
# .claude/settings.json. Input: the repo settings. $m[0]: settings-minimal.json.
# Usage: jq --slurpfile m settings-minimal.json -f merge-minimal.jq settings.json
#
# Drops $schema and $comment, and drops each disable* key set to false: false
# is the same as unset. Appends the deny entries that the repo does not have
# yet, so the existing order stays and a re-run adds nothing.

($m[0]
  | del(.["$schema"], .["$comment"])
  | with_entries(select(.value != false or (.key | startswith("disable") | not)))
) as $min
| (.permissions.deny // []) as $deny
| .permissions.deny = $deny + (($min.permissions.deny // []) - $deny)
| . + ($min | del(.permissions))
