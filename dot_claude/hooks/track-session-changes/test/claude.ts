/**
 * Unit cases for ../claude.ts: the first line and the text before a Claude Code edit. check.ts
 * runs them.
 */
import assert from "node:assert/strict";
import { lineEndings, patchLine, rebuildOriginal, type Hunk } from "../claude.ts";

// Edit and Write: new start plus the context lines before.
{
  // The structuredPatch of a real Edit of line 3, from the probe of 2026-10-14.
  const edit = [" one", " two", "-three", "+THREE", " four", " five"];
  assert.equal(patchLine([{ newStart: 1, lines: edit }]), 3);
  // A Write that appends: the first + line.
  const append = [" THREE", " four", " five", "+", "+six"];
  assert.equal(patchLine([{ newStart: 3, lines: append }]), 6);
  // A Write that creates a file has no hunks: line 1.
  assert.equal(patchLine([]), 1);
}

// CRLF: originalFile gets the CRLF of the file, mixed gives none.
{
  assert.equal(lineEndings("a\nb\n", "a\r\nB\r\n"), "a\r\nb\r\n");
  assert.equal(lineEndings("a\nb\n", "a\nB\n"), "a\nb\n");
  assert.equal(lineEndings("a\r\nb\r\n", "a\r\nB\r\n"), "a\r\nb\r\n");
  assert.equal(lineEndings("a\nb\n", "a\r\nB\n"), undefined);
}

/** A structuredPatch hunk as Claude Code gives it: tabs as two spaces. */
export const hunk = (oldStart: number, newStart: number, lines: string[]): Hunk => ({
  oldStart,
  oldLines: lines.filter((line) => line[0] !== "+").length,
  newStart,
  newLines: lines.filter((line) => line[0] !== "-").length,
  lines: lines.map((line) => line.replace(/\t/g, "  ")),
});

// rebuild: the occurrence in the hunk, not an equal one before it.
{
  const before = "x = 1\na\nb\nc\nd\ne\nf\ng\nx = 1\n";
  const after = "x = 1\na\nb\nc\nd\ne\nf\ng\nx = 2\n";
  // newString "x = 2" is only at line 9, but "x = 1" twice in the before text.
  const patch = [hunk(6, 6, [" e", " f", " g", "-x = 1", "+x = 2"])];
  assert.equal(rebuildOriginal(after, { oldString: "x = 1", newString: "x = 2" }, patch), before);
  // A newString that is also elsewhere in the file, far from the hunk.
  const twice = "y\n1\n2\n3\n4\n5\n6\ny\n";
  assert.equal(
    rebuildOriginal(twice, { oldString: "z", newString: "y" }, [
      hunk(5, 5, [" 4", " 5", " 6", "-z", "+y"]),
    ]),
    "y\n1\n2\n3\n4\n5\n6\nz\n",
  );
}

// rebuild: a file with tabs, shown as two spaces in the patch.
{
  const before = "\tif x:\n\t\treturn 1\n";
  const after = "\tif x:\n\t\treturn 2\n";
  const patch = [hunk(1, 1, [" \tif x:", "-\t\treturn 1", "+\t\treturn 2"])];
  assert.equal(
    rebuildOriginal(after, { oldString: "return 1", newString: "return 2" }, patch),
    before,
  );
}

// rebuild: an occurrence that reaches past its hunk.
{
  // oldString and newString share 5 first lines, so the hunk starts later.
  const shared = "s1\ns2\ns3\ns4\ns5\n";
  const before = `top\n${shared}old\nend\n`;
  const after = `top\n${shared}new\nend\n`;
  const patch = [hunk(4, 4, [" s3", " s4", " s5", "-old", "+new", " end"])];
  assert.equal(
    rebuildOriginal(after, { oldString: `${shared}old`, newString: `${shared}new` }, patch),
    before,
  );
}

// rebuild: replaceAll, an empty newString, and no fit.
{
  const before = "a\nk\nb\nc\nd\ne\nf\ng\nh\nk\n";
  const after = "a\nK\nb\nc\nd\ne\nf\ng\nh\nK\n";
  const patch = [
    hunk(1, 1, [" a", "-k", "+K", " b", " c", " d"]),
    hunk(7, 7, [" f", " g", " h", "-k", "+K"]),
  ];
  const all = { oldString: "k", newString: "K", replaceAll: true };
  assert.equal(rebuildOriginal(after, all, patch), before);
  const cut = rebuildOriginal("a\nc\n", { oldString: "b\n", newString: "" }, [
    hunk(1, 1, [" a", "-b", " c"]),
  ]);
  assert.equal(cut, "a\nb\nc\n");
  // The patch does not fit the edit: no text, not a wrong one.
  assert.equal(rebuildOriginal(after, { oldString: "q", newString: "K" }, patch), undefined);
}
