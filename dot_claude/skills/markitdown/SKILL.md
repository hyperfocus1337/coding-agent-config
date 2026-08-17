---
name: markitdown
description: Convert PDF, Office, image, audio, HTML, CSV, JSON, XML, ZIP and EPub files to Markdown with the markitdown CLI. Use before you read a PDF or other binary document, so you read a Markdown copy instead of the raw file. Also use when the user asks to convert a file, a directory, or a glob to Markdown, or says "markitdown", "extract the text from this PDF", or "turn these docx files into markdown".
---

# markitdown

Convert a file to Markdown with the [`markitdown`](https://github.com/microsoft/markitdown) CLI, then read the Markdown.

## When to convert instead of reading

Before you read a PDF, Word, PowerPoint, Excel, or EPub file, convert it and read the Markdown output. The Markdown copy keeps the headings, lists, and tables, and costs less context than the raw file.

Write the Markdown to the scratchpad directory when the conversion only serves your own reading. Write it next to the source when the user asks for the Markdown file itself.

## Single file

Temporary copy for reading:

```bash
markitdown report.pdf -o "$SCRATCHPAD/report.md"
```

Output the user keeps, next to the source:

```bash
markitdown report.pdf -o report.md
```

## Directory or glob

Loop and keep each original name:

```bash
for f in docs/*.pdf; do markitdown "$f" -o "${f%.pdf}.md"; done
```

Change the `*.pdf` glob to the file type the target holds: `*.docx`, `*.pptx`, `*.xlsx`, `*.html`, and others.

## Notes

- Without `-o`, markitdown prints to stdout, so `markitdown file.pdf > out.md` also works.
- Report where each output landed.
- If `markitdown` is missing, install it with `uv tool install markitdown[all]` or `pip install markitdown[all]`.
- If the source is a scanned PDF with no text layer, markitdown returns little or nothing. Read the pages as images instead.
