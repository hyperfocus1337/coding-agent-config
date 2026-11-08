/** Unit cases for ../codex.ts: the files of an apply_patch call. check.ts runs them. */
import assert from "node:assert/strict";
import { patchFiles } from "../codex.ts";

// apply_patch: add, update, delete, move, relative and absolute.
{
  const patch = [
    "*** Begin Patch",
    "*** Add File: new.txt",
    "+x",
    "*** Update File: /abs/old.txt",
    "@@",
    "*** Delete File: sub/gone.txt",
    "*** Update File: from.txt",
    "*** Move to: to.txt",
    "*** End Patch",
  ].join("\n");
  assert.deepEqual(patchFiles(patch, "/w"), [
    { status: "A", path: "/w/new.txt" },
    { status: "M", path: "/abs/old.txt" },
    { status: "D", path: "/w/sub/gone.txt" },
    { status: "D", path: "/w/from.txt" },
    { status: "A", path: "/w/to.txt" },
  ]);
}
