/** Unit cases for formatters/ruff.ts: the change test of its summary. check.ts runs them. */
import assert from "node:assert/strict";
import { ruff } from "../formatters/ruff.ts";

assert.equal(ruff.changed?.("1 file reformatted\n"), true);
assert.equal(ruff.changed?.("1 file left unchanged\n"), false);
// --force-exclude: the exclude list of the project config also applies to a named file.
assert.ok((await ruff.argv("/a/x.py", {} as never)).includes("--force-exclude"));
