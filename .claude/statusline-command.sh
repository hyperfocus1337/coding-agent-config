#!/bin/bash

# Read JSON input from stdin
input=$(cat)

# Extract values from JSON
cwd=$(echo "$input" | jq -r '.workspace.current_dir')
model=$(echo "$input" | jq -r '.model.display_name')
output_style=$(echo "$input" | jq -r '.output_style.name // "default"')

# Get short directory name (basename)
dir_name=$(basename "$cwd")

# Get git branch if in a git repo (skip optional locks for performance)
if git -C "$cwd" rev-parse --git-dir > /dev/null 2>&1; then
    # Use --no-optional-locks to skip refreshing the index
    branch=$(git -C "$cwd" --no-optional-locks symbolic-ref --short HEAD 2>/dev/null || echo "detached")
    git_info=" on $(printf '\033[35m')"$branch"$(printf '\033[0m')"
else
    git_info=""
fi

# Build status line with colors (using printf for ANSI codes)
# Format: directory [on branch] via model [style]
printf "$(printf '\033[36m')%s$(printf '\033[0m')%s $(printf '\033[34m')via$(printf '\033[0m') %s" \
    "$dir_name" \
    "$git_info" \
    "$model"

# Add output style if it's not "default"
if [ "$output_style" != "default" ]; then
    printf " $(printf '\033[33m')[%s]$(printf '\033[0m')" "$output_style"
fi