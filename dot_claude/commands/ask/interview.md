---
description: Interview me in depth about an idea, then write a spec file instead of doing the work.
argument-hint: <idea>
disable-model-invocation: true
---

Interview me about the idea below. If it is empty, the idea is my last request.

Do no work on the idea. Read the code, the repository, and the conversation first, so that you do not ask what they already answer.

Cover every area that applies: technical implementation, UI and UX, data and state, failure modes, concerns, and tradeoffs. Ask the questions I would not think of myself, and leave out a question with an obvious answer. Ask through the AskUserQuestion tool, up to four questions per call, with the option you recommend first. Ask an open question as one line of text.

After each round, drop the questions the answers settle and add the questions they raise. Continue until no open decision is left.

Then write the spec to `<cwd>/.context/plans/<slug>-spec.md`. `<cwd>` is the absolute path of the current working directory, and `<slug>` is a short kebab-case name for the topic, for example `friends-tab-redesign-spec.md`. Do not write it under `~/.claude/`. Record each decision with the reason I gave, and each question I left open. State the absolute path in your reply, and do not start the work.

$ARGUMENTS
