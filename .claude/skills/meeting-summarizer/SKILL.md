---
name: meeting-summarizer
description: Generates a clear, structured English summary of a meeting, call, or interview transcript. Use whenever the user provides a transcript (pasted dialogue, or a .txt, .vtt, .srt, .md, or .docx file) and asks for a summary, meeting notes, minutes, recap, or action items. Automatically translates non-English transcripts into English before summarizing. Produces sectioned prose with descriptive headings and no bullet points, speaker attribution, timestamps for key moments, a decisions section, and an action-items table listing owner, task, and deadline. Triggers on requests like "summarize this meeting", "turn this transcript into notes", "minutes from this call", or "what were the action items".
license: Proprietary
---

# Meeting transcript summarizer

## Overview

This skill turns a raw meeting, call, or interview transcript into a polished, structured summary written in English. The summary uses descriptive section headings and concise prose (never bullet points), attributes points to speakers where they are identifiable, marks key moments with timestamps, calls out decisions explicitly, and closes with an action-items table. Non-English input is translated to English before the summary is written.

The goal is a recap a busy reader can scan in under a minute and trust completely, because nothing in it was invented.

## When to use this skill

Use it whenever the user supplies transcript-like content (dialogue with or without speaker labels and timestamps) and wants it condensed: meeting minutes, call recaps, interview notes, standup summaries, webinar notes, or a list of action items pulled from a conversation.

Do not use it for summarizing articles, reports, or single-author documents that are not conversational; those are better handled as a plain document summary.

## Input handling

### Supported inputs

The transcript may arrive as pasted text in the message, or as an uploaded file. Common formats:

| Format         | Notes                                                                                                                                            |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Pasted text    | Use directly.                                                                                                                                    |
| `.txt`, `.md`  | Plain text, read as-is.                                                                                                                          |
| `.vtt`, `.srt` | Subtitle/caption formats. Timestamps and cue numbers are in the file; strip cue numbers and use the timestamps for the metadata and key moments. |
| `.docx`        | Extract the text first (see below) before summarizing.                                                                                           |
| `.json`        | Some tools (Zoom, Teams, Fireflies, Otter) export structured transcripts. Parse speaker, text, and timestamp fields.                             |

### Reading transcript files

In an environment with file access (such as Cowork), look for the uploaded file (for example under the uploads directory) and read it before doing anything else.

For plain text, `.vtt`, `.srt`, `.md`, and `.json`, read the file directly. For `.docx`, extract the text first, for example with `python-docx` (`pip install python-docx --break-system-packages`) or by unzipping the archive and reading `word/document.xml`. If a `docx` skill is available, use it to extract the text.

If the transcript spans multiple files, read all of them and treat them as one continuous conversation in chronological order.

### Detecting language

Scan the transcript for its language. If any portion is not in English, translate that portion to English internally before summarizing, and note the original language in the metadata header (for example, "Source language: Dutch, translated to English"). Keep proper nouns, product names, and acronyms in their original form rather than translating them.

## Workflow

1. Locate and read the full transcript (file or pasted text).
2. Detect the language; translate non-English content to English internally.
3. Identify the participants and, where possible, their roles.
4. Read through once to map the structure: what topics were covered, in what order, what was decided, and what was assigned.
5. Group the discussion into a small number of logical sections with descriptive headings.
6. Write each section as concise prose, attributing points to speakers and adding timestamps for the moments that matter.
7. Extract every decision into its own section.
8. Extract every action item into the action-items table.
9. Review against the guardrails below before delivering.

## Output format

Produce the summary in the structure below. Headings use sentence case (capitalize only the first word). Section names should describe the actual content, not generic labels, so prefer "Budget approval for Q3" over "Topic 1".

### Metadata header

Open with a short block of facts that are present in the transcript. Omit any line whose information is not available rather than guessing.

```
Meeting: <title or subject, if stated>
Date: <date, if stated>
Participants: <names and roles, if identifiable>
Duration: <if derivable from timestamps>
Source language: <only if translation was needed>
```

### Summary sections

Two to six sections, each with a descriptive heading followed by one or more concise paragraphs. Cover the most important insights, discussions, and context. Attribute points to speakers when they are identifiable ("Maria raised concerns about the vendor timeline"). Include timestamps for notable moments in `[hh:mm:ss]` form, or whatever format the source uses; if the transcript has no timestamps, omit them.

Do not use bullet points anywhere in the summary body. Keep it tight: include key points and leave out filler, small talk, and repetition.

### Decisions

A short section listing the concrete decisions reached, in prose. If no decisions were made, write a single line saying so.

### Action items

A markdown table with one row per task. Use "Not specified" where a value is genuinely absent in the transcript. If no action items were identified, replace the table with a single line: "No action items were identified."

| Owner              | Task                               | Deadline                                  |
| ------------------ | ---------------------------------- | ----------------------------------------- |
| <person, if named> | <clear, specific task description> | <date or relative deadline, if mentioned> |

## Formatting rules

Write in English, in prose, with no bullet points in the summary body. Do not use em dashes; use commas, parentheses, or "to" for ranges instead. Use sentence case for all headings. Keep markdown tables correctly formatted with aligned pipes and a header separator row. Be concise, precise, and non-repetitive.

## Guardrails

Use only information present in the transcript. Do not infer attendees, decisions, deadlines, or outcomes that are not stated. If something is unclear, ambiguous, or marked inaudible, either omit it or flag it plainly (for example, "the owner of this task was not stated") rather than filling the gap with a guess.

Do not attribute a statement to a speaker unless the transcript makes the attribution clear. If speakers are unlabeled, summarize without attribution rather than assigning lines arbitrarily.

## Edge cases

If the transcript has no speaker labels, write the summary without attribution and note this once in the metadata header. If it has no timestamps, omit timestamps entirely. For very long transcripts, work through the whole thing in chronological chunks and then synthesize a single unified summary rather than summarizing each chunk separately. If the input does not look like a transcript at all, say so and ask the user to confirm before proceeding.

## Reference files

`reference/template.md` is the exact output skeleton to fill in. `reference/example.md` is a short worked example, including a translated line, that shows the expected style and level of detail. Load them when you need a concrete model to follow.
