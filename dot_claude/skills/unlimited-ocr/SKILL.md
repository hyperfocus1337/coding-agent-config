---
name: unlimited-ocr
description: OCR a scanned PDF, an image, or a directory of images to Markdown with the Unlimited-OCR model, locally on Apple Silicon. Use when a PDF has no text layer, when markitdown returns little or no text, or when the user asks to OCR or extract the text from a scan, photo, or screenshot.
argument-hint: <image | directory | pdf> [-o out.md] [flags]
disable-model-invocation: true
---

# unlimited-ocr

Run [Unlimited-OCR](https://github.com/baidu/Unlimited-OCR) through MLX on the GPU of an Apple Silicon Mac. The script prints the Markdown to stdout, or writes it to the `-o` file. Progress goes to stderr.

Input: $ARGUMENTS

```sh
uv run ~/.claude/skills/unlimited-ocr/scripts/ocr.py <image | directory | pdf> [-o out.md]
```

| Flag             | Effect                                                                                         |
| ---------------- | ---------------------------------------------------------------------------------------------- |
| `-o out.md`      | Write the Markdown to a file. Without it, the Markdown goes to stdout.                         |
| `--raw`          | Keep the `<\|det\|>type [x1, y1, x2, y2]<\|/det\|>` layout markers, for example to find a box. |
| `--max-tokens N` | Cap the tokens for each page. The default is 8192.                                             |
| `--dpi N`        | Resolution for PDF pages. The default is 300.                                                  |
| `--model ID`     | Another MLX conversion. The default is `mlx-community/Unlimited-OCR-8bit`.                     |

Write the output to the scratchpad directory when only you read it. Write it next to the source when the user asks for the Markdown file.

## Limits

- It runs only on macOS with Apple Silicon. In the devcontainer or on Linux, tell the user to run it on the host.
- The first run downloads the model (about 3.7 GB) to `~/.cache/huggingface`. On an M1 Pro, a dense page takes about 12 seconds.
- Each page is a separate model call, so a table or paragraph that continues on the next page loses context. A `<!-- page N -->` marker separates the pages.
- MLX does not have the no-repeat filter of the official code. If stderr shows `HIT --max-tokens`, that page probably repeats text. Check the end of that page in the output, and tell the user.
- A directory input reads only the images directly in it, in name order.
