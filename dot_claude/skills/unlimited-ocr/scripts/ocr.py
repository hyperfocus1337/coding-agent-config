# /// script
# requires-python = ">=3.12"
# dependencies = ["mlx-vlm", "pymupdf"]
# ///
"""OCR images or a PDF to Markdown with Unlimited-OCR on Apple Silicon (MLX).

Each page is a separate generate call. The official multi-page mode
(infer_multi) is not in mlx-vlm, so a table that continues on the next page
loses its context.

Usage:
  uv run ocr.py INPUT [-o OUT.md] [--raw] [--max-tokens N] [--model ID]
  uv run ocr.py --selftest

INPUT is an image, a directory of images, or a PDF. Without -o, the Markdown
goes to stdout. Progress goes to stderr.
"""

import argparse
import contextlib
import re
import sys
import tempfile
import time
from pathlib import Path

# Other 8-bit conversions (sahilchachra, mikoy92) ship a Metaspace tokenizer
# that leaves Ġ and Ċ in the output. This one keeps the ByteLevel original.
MODEL = "mlx-community/Unlimited-OCR-8bit"
PROMPT = "document parsing."
IMAGE_EXTS = {".png", ".jpg", ".jpeg", ".webp", ".bmp", ".tif", ".tiff"}

# From the Unlimited-OCR README: <|det|>type [bbox]<|/det|>content
DET_RE = re.compile(r"<\|det\|>([^<\s]+)(?:\s*\[[^\]]*\])?\s*<\|/det\|>(.*)", re.DOTALL)


def remove_det(raw: str) -> str:
    """Strip the layout markers and image blocks; blank line between blocks."""
    blocks, cur = [], None
    for line in raw.splitlines():
        line = line.rstrip()
        if not line:
            continue
        m = DET_RE.match(line)
        if m:
            category, content = m.group(1).strip(), m.group(2).strip()
            if category == "image":
                continue
            if cur is not None:
                blocks.append(cur)
            cur = [content] if content else []
            continue
        if cur is None:
            cur = []
        cur.append(line)
    if cur is not None:
        blocks.append(cur)
    return "\n\n".join("\n".join(b) for b in blocks if b).strip()


def collect_pages(src: Path, tmp: Path, dpi: int) -> list[Path]:
    if src.is_dir():
        pages = sorted(p for p in src.iterdir() if p.suffix.lower() in IMAGE_EXTS)
        if not pages:
            sys.exit(f"ocr: no images in {src}")
        return pages
    if src.suffix.lower() == ".pdf":
        # pyrefly: ignore[missing-import]
        import pymupdf

        pages = []
        with pymupdf.open(src) as doc:
            for i, page in enumerate(doc, 1):
                out = tmp / f"page_{i:04d}.png"
                page.get_pixmap(dpi=dpi).save(out)
                pages.append(out)
        return pages
    if src.suffix.lower() in IMAGE_EXTS:
        return [src]
    sys.exit(f"ocr: not an image, a PDF, or a directory: {src}")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("input", type=Path, nargs="?")
    ap.add_argument("-o", "--output", type=Path)
    ap.add_argument("--raw", action="store_true", help="keep the <|det|> layout markers")
    ap.add_argument("--max-tokens", type=int, default=8192, help="cap per page (default 8192)")
    ap.add_argument("--dpi", type=int, default=300, help="PDF render resolution (default 300)")
    ap.add_argument("--model", default=MODEL)
    ap.add_argument("--selftest", action="store_true", help="test remove_det, no model")
    args = ap.parse_args()

    if args.selftest:
        raw = "<|det|>title [1,2,3,4]<|/det|># Head\n<|det|>image [0,0,9,9]<|/det|>\n<|det|>text [5,6,7,8]<|/det|>line one\nline two\n"
        assert remove_det(raw) == "# Head\n\nline one\nline two", repr(remove_det(raw))
        print("ok   remove_det")
        return
    if args.input is None or not args.input.exists():
        ap.error(f"input not found: {args.input}")

    # The script-header deps exist only under `uv run`, so pyrefly cannot see them.
    # pyrefly: ignore[missing-import]
    from mlx_vlm import apply_chat_template, generate, load

    with tempfile.TemporaryDirectory(prefix="ocr_") as tmp:
        pages = collect_pages(args.input, Path(tmp), args.dpi)
        # load() prints tokenizer notes to stdout, where the Markdown goes.
        with contextlib.redirect_stdout(sys.stderr):
            model, processor = load(args.model)
        prompt = apply_chat_template(processor, model.config, PROMPT, num_images=1)
        parts = []
        for i, page in enumerate(pages, 1):
            start = time.monotonic()
            result = generate(
                model, processor, prompt, image=str(page), max_tokens=args.max_tokens, temperature=0.0
            )
            capped = result.generation_tokens >= args.max_tokens
            print(
                f"ocr: page {i}/{len(pages)}: {result.generation_tokens} tokens, "
                f"{time.monotonic() - start:.1f}s"
                f"{', HIT --max-tokens (likely a repetition loop)' if capped else ''}",
                file=sys.stderr,
            )
            text = result.text if args.raw else remove_det(result.text)
            parts.append(f"<!-- page {i} -->\n\n{text}" if len(pages) > 1 else text)

    md = "\n\n".join(parts) + "\n"
    if args.output:
        args.output.write_text(md)
        print(f"ocr: wrote {args.output}", file=sys.stderr)
    else:
        sys.stdout.write(md)


if __name__ == "__main__":
    main()
