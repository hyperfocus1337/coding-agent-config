#!/usr/bin/env bash
# Shared by the Bash, Zsh, and Fish launch functions.

fail() {
  printf '%s\n' "$*" >&2
  exit 2
}

mode=claude
include=
exclude=
while [[ $# -gt 0 ]]; do
  case "$1" in
    --mode | --include | --exclude)
      [[ $# -ge 2 ]] || fail "Missing value for $1"
      case "$1" in
        --mode) mode="$2" ;;
        --include | --exclude)
          case "$2" in
            '' | ,* | *, | *,,*) fail "Invalid rule list for $1: $2" ;;
          esac
          if [[ "$1" == --include ]]; then include="$2"; else exclude="$2"; fi
          ;;
      esac
      shift 2
      ;;
    --)
      shift
      break
      ;;
    --help | -h)
      printf '%s\n' 'Usage: claude-rules [--mode NAME] [--include NAMES] [--exclude NAMES] [-- CLAUDE_ARGS...]'
      exit 0
      ;;
    *) fail "Unknown launcher option: $1. Put Claude arguments after --." ;;
  esac
done

flags=()
export ENABLE_CLAUDEAI_MCP_SERVERS=false
case "$mode" in
  claude | claude-nohooks | claude-norules | claude-nohooks-norules)
    settings=$(jq -c . "$HOME/.claude/settings-minimal.json") || exit 2
    ;;
  claude-full)
    unset ENABLE_CLAUDEAI_MCP_SERVERS
    settings='{}'
    ;;
  claude-vanilla)
    settings=$(jq -c . "$HOME/.claude/settings-vanilla.json") || exit 2
    ;;
  claude-vanilla-minimal)
    settings=$(jq -cs '.[0] * .[1]' "$HOME/.claude/settings-minimal.json" \
      "$HOME/.claude/settings-vanilla.json") || exit 2
    ;;
  *) fail "Unknown launch mode: $mode" ;;
esac
case "$mode" in
  claude-nohooks | claude-nohooks-norules)
    settings=$(jq -c '.disableAllHooks = true' <<<"$settings") || exit 2
    ;;
esac
case "$mode" in
  claude-norules | claude-nohooks-norules | claude-vanilla | claude-vanilla-minimal)
    [[ -z "$include$exclude" ]] || fail "Rule filters cannot be used with $mode"
    export CLAUDE_CODE_DISABLE_CLAUDE_MDS=1
    ;;
esac
case "$mode" in
  claude-vanilla | claude-vanilla-minimal) flags+=(--setting-sources '' --strict-mcp-config) ;;
esac

# Preserve the last --settings override for unfiltered launches.
forwarded=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    --settings | --settings=*)
      [[ -z "$include$exclude" ]] || fail '--settings cannot be used with rule filters'
      if [[ "$1" == --settings ]]; then
        [[ $# -ge 2 ]] || fail 'Missing value for --settings'
        settings="$2"
        shift 2
      else
        settings="${1#--settings=}"
        shift
      fi
      ;;
    --)
      forwarded+=("$@")
      break
      ;;
    *)
      forwarded+=("$1")
      shift
      ;;
  esac
done

if [[ -n "$include$exclude" ]]; then
  included=()
  excluded=()
  for filter in include exclude; do
    if [[ "$filter" == include ]]; then selection="$include"; else selection="$exclude"; fi
    while [[ -n "$selection" ]]; do
      name="${selection%%,*}"
      if [[ "$filter" == include ]]; then included+=("${name%.md}"); else excluded+=("${name%.md}"); fi
      [[ "$selection" == *,* ]] || break
      selection="${selection#*,}"
    done
  done

  files=()
  names=()
  scanned=false
  while IFS= read -r -d '' file; do
    if [[ -z "$file" ]]; then
      scanned=true
    else
      files+=("$file")
      name="${file#"$HOME/.claude/rules/"}"
      names+=("${name%.md}")
    fi
  done < <(find -L "$HOME/.claude/rules" -type f -name '*.md' -print0 && printf '\0')
  # The empty record confirms that find completed without an error.
  [[ "$scanned" == true ]] || exit 2

  for name in "${included[@]}" "${excluded[@]}"; do
    found=false
    for rule in "${names[@]}"; do
      if [[ "$rule" == "$name" ]]; then
        found=true
        break
      fi
    done
    [[ "$found" == true ]] || fail "Unknown user rule: $name"
  done

  paths=()
  for file in "${files[@]}"; do
    name="${file#"$HOME/.claude/rules/"}"
    load=true
    if [[ -n "$include" ]]; then
      load=false
      for rule in "${included[@]}"; do
        if [[ "$rule" == "${name%.md}" ]]; then
          load=true
          break
        fi
      done
    fi
    for rule in "${excluded[@]}"; do
      if [[ "$rule" == "${name%.md}" ]]; then
        load=false
        break
      fi
    done
    if [[ "$load" == false ]]; then paths+=("$file"); fi
  done

  settings=$(jq -cn --argjson settings "$settings" --args \
    '$settings | .claudeMdExcludes = ((.claudeMdExcludes // []) + $ARGS.positional | unique)' \
    "${paths[@]}") || exit 2
fi

exec claude "${flags[@]}" --settings "$settings" "${forwarded[@]}"
