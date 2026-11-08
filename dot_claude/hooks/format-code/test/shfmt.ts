/** Unit cases for formatters/shfmt.ts: the .editorconfig search. check.ts runs them. */
import assert from "node:assert/strict";
import type { Io } from "../core.ts";
import { shfmt } from "../formatters/shfmt.ts";

/** An Io where only `paths` exist, each with the kind that it maps to. */
const io = (paths: Record<string, "file" | "dir"> = {}): Io => ({
  stat: async (path) => (paths[path] ? { kind: paths[path], mtimeMs: 0 } : undefined),
  run: async () => assert.fail("argv runs no program"),
});

// An .editorconfig in a folder above sets the style, so shfmt gets no printer flag.
assert.deepEqual(await shfmt.argv("/a/b/x.sh", io({ "/a/.editorconfig": "file" })), [
  "shfmt",
  "-l",
  "-w",
  "/a/b/x.sh",
]);
// With none, or only a folder of that name, the 2-space fallback of just fmt applies.
for (const paths of [{}, { "/a/.editorconfig": "dir" }] as Record<string, "file" | "dir">[])
  assert.deepEqual(await shfmt.argv("/a/b/x.sh", io(paths)), [
    "shfmt",
    "-l",
    "-w",
    "-i",
    "2",
    "-ci",
    "/a/b/x.sh",
  ]);
