---
allowed-tools: Bash(git log:*), Bash (git branch:*), Bash (date:*), Bash(mkdir:*), Write, Read
argument-hint: [period]
description: Generate a changelog file for the specified time period (day, week, month, year, or number of days)
---

Generate a changelog for the last $ARGUMENTS and save it to a dated file.

First, ensure the changelog directory exists:
!mkdir -p changelog

Get today's date for the filename:
!date '+%Y-%m-%d'

Parse the time period argument to determine the git log time filter:
- If "$ARGUMENTS" is "day", use "--since='1 day ago'"
- If "$ARGUMENTS" is "week", use "--since='1 week ago'"
- If "$ARGUMENTS" is "month", use "--since="1 month ago'"
- If "$ARGUMENTS" is "year", use "--since='1 year ago'"
- If "$ARGUMENTS" is a number. use "--since='$ARGUMENTS days ado'"
- It no argument provided, default to "week"

Get the current branch:
!git branch --show-current

Fetch all commits from the specified period:
!git log --since='[appropriate time filter based on $ARGUMENTS]' —-pretty=format:'h|%as|%s|%an' --reverse

Process the commits and organize them by type:
1. Parse each commit message for conventional commit types (feat:, fix:, refactor:, docs:, test:, chore:)
2. Group commits by their type
3. Extract key features and fixes for the summary

Create a markdown changelog with the following structure:

# Changelog - [Today's Date]

## Period: Last $ARGUMENTS
**Branch:** [current branch]
**Generated:** [current timestamp]

## Key Highlights

### Major Features
- List the most significant feature additions
- Focus on user-facing improvements

### Important Fixes
- List critical bug fixes
- Include any performance improvements

## Detailed Changes

### Features
List each feature commit with:
- '[hash]' Description (by author on date)

### Bug Fixes
List each fix commit with:
- '[hash]' Description (by author on date)
