---
description: Convert files (PDF, Office, images, audio, HTML, etc.) to Markdown with markitdown.
argument-hint: [file | directory | glob]
---

Convert the argument to Markdown using the `markitdown` CLI (https://github.com/microsoft/markitdown).

Target: `$ARGUMENTS`

Pick the case that matches the target and run it:

**Single file** — write the Markdown next to the source with a `.md` extension:

```bash
markitdown "$ARGUMENTS" -o "${ARGUMENTS%.*}.md"
```

**A directory or glob of files** (e.g. a folder of PDFs) — loop and convert each, keeping the original name:

```bash
for f in "$ARGUMENTS"/*.pdf; do markitdown "$f" -o "${f%.pdf}.md"; done
```

Adjust the `*.pdf` glob to whatever file type the target holds (`*.docx`, `*.pptx`, `*.xlsx`, `*.html`, ...). markitdown converts PDF, Word, PowerPoint, Excel, images, audio, HTML, CSV, JSON, XML, ZIP, EPub and more.

Notes:
- If no `-o` is given, markitdown prints to stdout, so `markitdown file.pdf > out.md` also works.
- After converting, report where each output landed. 
- If markitdown is missing, install it with `uv tool install markitdown[all]` (or `pip install markitdown[all]`).
