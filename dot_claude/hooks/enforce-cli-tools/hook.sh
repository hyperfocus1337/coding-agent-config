#!/usr/bin/env bash
set -u

# --- Rules table ---
# All the policy lives in `rules`; the code below is only the matcher.
rules_file=${BASH_SOURCE[0]%/*}
[ "$rules_file" = "${BASH_SOURCE[0]}" ] && rules_file=. # bare filename → cwd
rules_file=$rules_file/rules

# Parallel arrays, not an associative one: macOS bash 3.2 lacks those.
rule_tool=() rule_replacement=()
if [ -f "$rules_file" ]; then
  # `|| [ -n ... ]` keeps the last line when the file has no trailing newline.
  while read -r tool replacement || [ -n "$tool" ]; do
    case $tool in ''|'#'*) continue ;; esac # skip blank and comment lines
    [ -n "$replacement" ] || continue       # a rule needs both halves
    # replacement took the rest of the line, so "pnpm dlx" survives whole.
    rule_tool+=("$tool")
    rule_replacement+=("$replacement")
  done < "$rules_file"
fi

# --- Allowlist ---
# Filled by the hook body; declared here so test.sh can source and set it.
allowlist=()

# $1 = banned tool name; 0 if this repo/session may still use it.
is_allowed() { [[ " ${allowlist[*]-} " == *" $1 "* ]]; }

# --- Command-position tokeniser ---
# commands_run <command line> -> the command each segment actually runs, one per
# line. Only these positions are checked, so `rg npm` and `git commit -m "drop
# npm"` stay clean: the banned name has to be the thing being executed.
commands_run() {
  # separators must stay a variable: an inline `}` or backtick inside
  # ${line//[...]/} ends the expansion early and the rest of the line goes live.
  local line=$1 quoted_span="('[^']*'|\"[^\"]*\")" separators='[&|;(){}`]'
  local segment words word wrapped
  # Blank quoted spans first, so a separator inside a string is not mistaken for
  # one between commands. ponytail: heredoc bodies are still split naively.
  while [[ $line =~ $quoted_span ]]; do line=${line/"${BASH_REMATCH[1]}"/q}; done
  # Split on the separators plus newline. Brackets count: whatever runs inside
  # $(...), backticks or { ...; } is its own command wherever it sits.
  while IFS= read -r segment; do
    read -ra words <<< "$segment" # read splits on IFS but, unlike `set --`, never globs
    [ ${#words[@]} -eq 0 ] && continue
    wrapped=
    for word in "${words[@]}"; do
      # Step over what precedes the real command: `sudo npm ci`, `CI=1 npm build`.
      case $word in
        *=*|sudo|env|command|builtin|exec|nohup|time|timeout|nice|stdbuf|xargs) wrapped=1; continue ;;
      esac
      # Then the wrapper's own flags and values (`env -i npm`, `timeout 30 npm`).
      # Gated: the first word of a real command is never a flag or a bare number.
      [ -n "$wrapped" ] && case $word in -*|[0-9]*) continue ;; esac
      word=${word##*/}              # /usr/local/bin/npm → npm
      [ -n "$word" ] || continue    # a bare trailing slash is not a command
      printf '%s\n' "$word"
      break
    done
  done <<< "${line//$separators/$'\n'}"
}

# violation <command line> -> prints "<tool> <replacement>" and returns 0 on the
# first banned tool found, 1 when the command is clean. First hit wins.
violation() {
  # Guard, not an optimisation: "${arr[@]}" on an empty array trips `set -u` on
  # bash before 4.4, which is what macOS ships.
  [ ${#rule_tool[@]} -eq 0 ] && return 1
  local command i
  while read -r command; do
    for i in "${!rule_tool[@]}"; do
      [ "$command" = "${rule_tool[i]}" ] || continue
      is_allowed "$command" && continue
      printf '%s %s\n' "$command" "${rule_replacement[i]}"
      return 0
    done
  done < <(commands_run "$1")
  return 1
}

# Sourced by test.sh? Stop before the body reads stdin. Placed after the
# functions so sourcing loads them without blocking on `read`.
[[ "${BASH_SOURCE[0]}" == "${0}" ]] || return 0

# --- Allow helper ---
# Cursor rejects empty stdout as invalid JSON and blocks; Claude Code ignores the
# unknown field and proceeds on exit 0. One line satisfies both.
allow() { printf '{"permission":"allow"}\n'; exit 0; }

IFS= read -r -d '' payload

# --- Cheap pre-filter ---
# Everything below forks, and almost every command is clean, so bail here first:
# no fork, one glob per rule. Deliberately a plain substring. A word-boundary
# version was tried and silently lost enforcement: the payload is still JSON, so
# "cd x\nnpm i" puts the escape's `n` in front of the word. Over-matching only
# costs a jq fork; violation() is still the real matcher.
[ ${#rule_tool[@]} -eq 0 ] && allow # same bash 3.2 `set -u` guard as above
candidate=
for tool in "${rule_tool[@]}"; do
  case $payload in *"$tool"*) candidate=1; break ;; esac
done
[ -n "$candidate" ] || allow

# --- Read the command out of the payload ---
# Claude Code nests it under .tool_input, Cursor passes it flat. jq missing or no
# command → allow, so the hook self-disables instead of blocking everything.
command_line=$(printf '%s' "$payload" | jq -r '.tool_input.command // .command // empty' 2>/dev/null) || allow
[ -n "$command_line" ] || allow

# --- Overrides (see README) ---
# Both name specific tools rather than switching the hook off wholesale:
#   * .claude-allow-cli-tools file: one tool per line (# comments / blanks ok)
#   * CLAUDE_ALLOW_CLI_TOOLS env var: whitespace- or colon-separated, one-off
root="${CLAUDE_PROJECT_DIR:-$PWD}"
if [ -f "$root/.claude-allow-cli-tools" ]; then
  # Same no-trailing-newline guard as the rules file. `read -r tool _` takes the
  # first word only, so an inline `# why` comment stays out of the tool name.
  while IFS= read -r line || [ -n "$line" ]; do
    read -r tool _ <<< "$line"
    case $tool in ''|'#'*) continue ;; esac
    allowlist+=("$tool")
  done < "$root/.claude-allow-cli-tools"
fi
if [ -n "${CLAUDE_ALLOW_CLI_TOOLS:-}" ]; then
  IFS=$' \t\n:' read -ra env_tools <<< "$CLAUDE_ALLOW_CLI_TOOLS"
  allowlist+=("${env_tools[@]}")
fi

violated=$(violation "$command_line") || allow
read -r tool replacement <<< "$violated"

# Best-effort hint: swap the first occurrence so the model can retry in one turn.
suggested=${command_line/$tool/$replacement}

# --- Block and report ---
# stderr: Claude Code feeds this back to the model as the block reason (exit 2).
{
  echo "Blocked: \`$tool\` is not allowed here, use \`$replacement\` instead."
  echo "  suggested: $suggested"
  echo
  echo "Allow it anyway with one of:"
  echo "  * add \"$tool\" to $root/.claude-allow-cli-tools (persistent, per-repo)"
  echo "  * set CLAUDE_ALLOW_CLI_TOOLS=$tool (one-off, colon-separated)"
} 1>&2

# stdout: Cursor's deny + message. Only rule words are interpolated, never the
# command, so a quote in the command cannot malform the JSON (Cursor fails open
# on bad JSON). Full detail is in the stderr block above.
# shellcheck disable=SC2016  # the backticks are markdown for the model, not a subshell
printf '{"permission":"deny","agent_message":"Blocked: `%s` is not allowed here, use `%s` instead. See the blocked-command output for the suggested command and the override options."}\n' "$tool" "$replacement"
exit 2
