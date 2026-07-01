---
name: improve-issue-in-place
description: Fetch a GitHub issue, rewrite its description to be clearer and more actionable, then update it in-place via gh
allowed-tools: Bash(gh *)
---

## Fetched issue data

- Issue JSON: !`gh issue view $ARGUMENTS --json number,title,body,labels,assignees,comments,url`
- Repo issue templates: !`find .github/ISSUE_TEMPLATE -name "*.md" -o -name "*.yml" 2>/dev/null | head -5 | xargs cat 2>/dev/null || echo "No issue templates found"`

## Your task

You are a senior engineering lead doing a backlog grooming pass. Your job is to improve the issue description for the fetched issue so it is clear, complete, and immediately actionable for any engineer picking it up cold.

### Step 1 — Analyse the issue

Before rewriting, identify what is missing or unclear:
- Is the problem statement unambiguous?
- Are reproduction steps present and specific (for bugs)?
- Are acceptance criteria defined (for features/tasks)?
- Is there enough context (environment, version, affected component)?
- Is the title accurate and specific enough?

### Step 2 — Rewrite the body

Produce an improved issue body in GitHub Flavored Markdown using this structure (adapt sections to the issue type):

```
## Problem

<What is broken or missing. One short paragraph. State expected vs actual behaviour for bugs.>

## Steps to reproduce        ← bugs only; replace with "## Goal" for features
1. 
2. 
3. 

## Expected behaviour        ← bugs only
<What should happen>

## Actual behaviour          ← bugs only
<What actually happens>

## Acceptance criteria       ← features/tasks; remove for bugs
- [ ] 
- [ ] 

## Context
- Environment / OS:
- Version / branch:
- Relevant config or links:

## Notes (optional)
<Open questions, proposed approach, related issues>
```

Rules:
- Preserve the author's original intent — improve clarity, not scope
- Keep language concise; remove filler phrases
- If information is genuinely missing, add a clearly marked placeholder: `<!-- TODO: add reproduction steps -->`
- Do NOT invent specifics you cannot infer from the existing text or comments

### Step 3 — Rewrite the title (if needed)

If the title is vague (e.g. "Bug fix", "Issue with login"), propose a more specific one following the pattern:
- Bug: `[Component] Short description of what breaks`
- Feature: `[Component] Add/support/enable <capability>`

### Step 4 — Update the issue in-place

Once you have the improved body (and optionally a new title), run the appropriate `gh` command(s):

**Body only:**
```bash
gh issue edit $ARGUMENTS --body "<improved body here>"
```

**Body + title:**
```bash
gh issue edit $ARGUMENTS --title "<improved title>" --body "<improved body here>"
```

After the edit, confirm success by running:
```bash
gh issue view $ARGUMENTS --json title,body,url
```

Then print a short summary:
- ✅ Issue #$ARGUMENTS updated
- URL: <url>
- Changes made: <bullet list of what you changed and why>
- ⚠️ Missing info flagged: <anything you could not fill in>

