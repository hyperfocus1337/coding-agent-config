#!/usr/bin/env bash
# Test for ocr.py: the marker cleanup, then a 2-page PDF through the model.
# Run: bash test.sh. Needs uv on PATH. The smoke test needs Apple Silicon and
# downloads the model (about 3.7 GB) on the first run.
set -u

OCR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../scripts" && pwd)/ocr.py"
command -v uv >/dev/null 2>&1 || { echo "SKIP no uv on PATH"; exit 0; }

uv run -q "$OCR" --selftest || exit 1

if [[ "$(uname -sm)" != "Darwin arm64" ]]; then
  echo "SKIP smoke test: MLX needs Apple Silicon"; exit 0
fi

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
uv run -q --with pymupdf python -I - "$tmp/in.pdf" <<'EOF'
import sys, pymupdf
doc = pymupdf.open()
for title, line in [("Invoice 4711", "Total due: 1,250.00 EUR"), ("Appendix B", "The quick brown fox.")]:
    page = doc.new_page()
    page.insert_text((72, 100), title, fontsize=24)
    page.insert_text((72, 150), line, fontsize=12)
doc.save(sys.argv[1])
EOF

uv run -q "$OCR" "$tmp/in.pdf" -o "$tmp/out.md" 2>"$tmp/err" || { cat "$tmp/err"; echo "FAIL ocr.py exited non-zero"; exit 1; }
fail=0
for want in '<!-- page 2 -->' 'Invoice 4711' '1,250.00 EUR' 'Appendix B' 'quick brown fox'; do
  if grep -qF "$want" "$tmp/out.md"; then echo "ok   output holds '$want'"; else echo "FAIL output lacks '$want'"; fail=1; fi
done
if grep -qE '<\|det\||Ġ|Ċ' "$tmp/out.md"; then echo "FAIL markers or BPE marks left in output"; fail=1; else echo "ok   output is clean"; fi
[[ $fail -eq 0 ]] || cat "$tmp/out.md"
exit "$fail"
