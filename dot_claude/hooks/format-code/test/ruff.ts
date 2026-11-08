/** Unit cases for formatters/ruff.ts. check.ts runs them. */
import assert from "node:assert/strict";
import { ruff } from "../formatters/ruff.ts";

// --force-exclude: the exclude list of the project config also applies to a named file. One run
// for each file, in its folder.
assert.deepEqual(await ruff.runs(["/a/x.py", "/b/y.py"], "/", {} as never), [
  { argv: ["ruff", "format", "--force-exclude", "/a/x.py"], cwd: "/a" },
  { argv: ["ruff", "format", "--force-exclude", "/b/y.py"], cwd: "/b" },
]);
