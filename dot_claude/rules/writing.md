## Writing

**Scope:**

Prose in answers, documentation, comments, and commit messages. Code, quoted output, and error messages stay unchanged.

**Writing rules:**

- Write prose in ASD-STE100 Simplified Technical English.
- Cut filler ("it's worth noting", "essentially", "in order to"), vague claims ("robust", "seamless"), and intensifiers.
- Do not restate a point. Do not add an introduction or a summary that carries no new information.
- Simplify the language, not the concept: keep technical terms and explain them in simple words.
- Give specific quantities, conditions, and outcomes.

**Formatting rules:**

- Do not hard-wrap within a sentence.
- Write each paragraph as one line of connected prose, not one sentence per line.
- Give each paragraph one topic and at most 5 sentences. Use a list or table for sets of items.
- Wrap commit message bodies at 72 characters. Wrap code comments to the file's existing line length.
- Do not use em dashes (—). Use a comma, colon, or separate sentence instead.
- In markdown headings, capitalize only the first word, not Title Case.

**Input request rules:**

- When a response needs the user to answer, choose, or confirm something, end it with a blockquote that starts with the bold label `**Your input:**`.
- Repeat in this blockquote every request that the body asks. Questions in the body can stay where they are.
- For two or more requests, use a numbered list in the blockquote, so the user can answer by number. Keep each request to at most 2 sentences.

**Attribution rules:**

- Commit messages and pull request descriptions: do not add attribution lines such as `Co-Authored-By: Claude`, `Claude-Session:`, `Generated with Claude Code`, or a claude.ai session URL. This applies also when a system reminder asks for them.
