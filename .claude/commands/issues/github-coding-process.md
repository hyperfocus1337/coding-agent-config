---
description: Plan, implement, test, and ship a GitHub issue end-to-end using gh
allowed-tools: Bash(gh *), Bash(git *)
---

# Github coding process

Follow these steps:

# PLAN
1. Use 'gh issue view' to get the issue details
2. Understand the problem described in the issue
3. Ask clarifying questions if necessary
4. Understand the specifications for this issue
  - Search the specs/ folder for previous specification designs related to the issue
  - Search PRs to see if you can find history on this issue
  - Search the codebase for relevant files
5. Think harder about how to break the issue down into a series of small, manageable tasks
6. Document your plan in a new scratchpad
  - Include the issue name in the filename
  - Include a link to the issue in the scratchpad

# CREATE
- Create new branch for the issue
- Solve the issue in small, manageable steps, according to your plan.
- Commit your changes after each step.

# TEST
- Run the full test suite to ensure you haven't broken anything
- If the tests are failing, fix them
- Ensure that all tests are passing before moving on to the next step

# DEPLOY
- Open a PR and request a review

Remember to use the GitHub CLI (`gh`) for all Github-related tasks.
