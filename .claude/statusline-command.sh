#!/bin/sh
# Status line derived from ~/.bashrc PS1 color prompt:
#   \[\033[01;32m\]\u@\h\[\033[00m\]:\[\033[01;34m\]\w\[\033[00m\]\$
# Showing only \w (current working directory) per user preference.
# Trailing "\$" removed per statusLine conventions.
input=$(cat)
cwd=$(echo "$input" | jq -r '.cwd')
printf '\033[01;34m%s\033[00m' "$cwd"