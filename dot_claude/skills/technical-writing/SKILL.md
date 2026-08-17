---
name: technical-writing
description: Write or edit clear technical English for software developers and operators, using Google developer documentation style as the primary standard plus selected ASD-STE100 principles. Use when writing or revising documentation, README files, release notes, API reference text, error messages, help text, code comments, commit messages, or any prose in a technical deliverable. Also use when the user asks to tighten, de-fluff, clarify, or copy-edit existing technical prose, or says "make this read like docs".
---

# technical-writing

Write clear technical English for software developers and operators.

Use principles from the Google developer documentation style guide as the primary writing standard. Apply selected ASD-STE100 Simplified Technical English (STE) principles when they improve procedural clarity, safety, or translation. Do not claim formal compliance with either standard.

Treat these sources as guidance. Follow terminology and conventions defined by the current project when they differ from the general guidance.

## Style

- Use short, direct sentences.
- Keep one primary statement in each sentence. Keep a cause and its result together when this makes the relationship clear.
- Prefer active voice when the actor matters or is known. Use passive voice when the actor is unknown, irrelevant, or not the subject of the documentation.
- Use present tense to describe current behavior.
- Use concrete verbs instead of abstract noun phrases.
- Avoid choppy prose. Combine closely related information when this improves comprehension.
- Use parallel structure for similar list items and instructions.
- Put the most important or distinguishing information early in a paragraph.
- Write in a natural, professional tone. Do not make the prose mechanical or artificially conversational.

## Terminology

- Use exact and consistent technical terminology.
- Preserve official API names, field names, commands, identifiers, protocol terms, and upstream terminology.
- Define an uncommon term or abbreviation when the intended reader might not know it. Define it on each standalone documentation page when necessary.
- Use literal language. Avoid idioms, metaphors, cliches, and culturally specific references.
- Do not simplify away important technical detail. Simplify the language, not the underlying concept.

## Precision

- Prefer specific quantities, conditions, actions, and outcomes over general statements.
- Avoid unnecessary modifiers, intensifiers, filler, marketing language, and unsupported praise.
- Avoid vague or inflated words such as "robust," "seamless," "powerful," "innovative," "cutting-edge," "comprehensive," "groundbreaking," or "leverages" unless they are technically necessary and specifically justified.
- Review "explicit" and "explicitly." Keep them only when they distinguish declared behavior from implicit, inferred, or default behavior.
- Replace inflated phrases such as "delves into," "showcases," "underscores," "boasts," and "serves as" with a direct factual verb when possible.
- Avoid "simply," "easy," "quickly," "obvious," "please note," and "at this time." These words can hide required knowledge, effort, or conditions.
- Avoid content-neutral phrases such as "it is important to note," "in today's rapidly evolving landscape," "at its core," "this allows users to," or "by leveraging."
- Replace generic importance statements with the specific mechanism, condition, or result.
- Do not restate the same point in different words.
- Remove stock introductions, summaries, and conclusions when the heading or preceding text provides the context.
- Use transitions only when they express a real relationship. Do not add "Moreover," "Furthermore," "Additionally," "Overall," or "Ultimately" only to make prose appear connected.
- Avoid repeated rhetorical contrasts such as "not only X, but also Y" or "X is not just A; it is B."
- Use the number of list items required by the content. Do not force an explanation into a three-item list.
- Remove words that do not change the technical meaning.
- Use "must" for a requirement, "should" for a recommendation, "can" for a capability, "may" for permission, and "might" for a possibility.
- Do not use "should" to describe an expected system state. State what the system does, what the user must configure, or what action follows a condition.

## Procedures

- Present steps in execution order.
- Use imperative verbs such as "Open," "Select," "Run," "Check," and "Replace."
- State conditions before the actions that depend on them.
- State the expected result when the reader must verify an action.

## Final pass

Before producing final text, remove unnecessary words, ambiguous pronouns, hidden actors, inconsistent terminology, vague conditions, repeated information, content-neutral framing, unsupported praise, and unnecessary rhetorical transitions.

For procedural or safety-critical text, run the STE checklist in [references/checklist.md](references/checklist.md). Correct any line that fails, then check again.

The final text should read like clear engineering documentation written for an international technical audience. It must be concise, precise, factual, and unambiguous.
