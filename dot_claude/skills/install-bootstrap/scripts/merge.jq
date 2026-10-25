# Merge a source settings file into a repo's .claude/settings.json. Input: the
# repo settings. $m[0]: the source, assets/settings.json or
# settings-minimal.json.
# Usage: jq --slurpfile m source.json -f merge.jq settings.json
#
# Drops $schema and $comment, and drops each disable* key set to false: false
# is the same as unset. Merges objects key by key. Appends the array items that
# the repo does not have yet, so the existing order stays and a re-run adds
# nothing. For any other value, the source wins.

def merge($a; $b):
  if ($a | type) == "object" and ($b | type) == "object" then
    reduce ($b | keys_unsorted[]) as $k ($a; .[$k] = merge(.[$k]; $b[$k]))
  elif ($a | type) == "array" and ($b | type) == "array" then
    $a + ($b - $a)
  else $b end;

($m[0]
  | del(.["$schema"], .["$comment"])
  | with_entries(select(.value != false or (.key | startswith("disable") | not)))
) as $src
| merge(.; $src)
