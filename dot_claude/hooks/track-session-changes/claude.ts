/**
 * The Claude Code part of the core: turns the result of an Edit, Write, or
 * NotebookEdit into the changes of ./core.ts. `structuredPatch` shows a tab as
 * two spaces, `originalFile` has LF line endings and can be missing, so the
 * text before the call is rebuilt here. hooks/register.ts (the mod) and
 * command.ts (`node command.ts claude`) call it. No Node import, so the mod
 * can run it.
 */

import { changedLine, recordFiles, resolve, type Io, type Where } from "./core.ts";

/** A hunk of Claude Code `structuredPatch`, as in Edit and Write results. */
export interface Hunk {
  oldStart?: number;
  oldLines?: number;
  newStart: number;
  newLines?: number;
  lines: string[];
}

/**
 * The first changed line of a Claude Code Edit or Write result: the new start
 * of the first hunk plus the context lines before the first + or - line. A
 * Write that creates a file has no hunks, so it gives line 1.
 */
export function patchLine(hunks: Hunk[] | undefined): number {
  const hunk = hunks?.[0];
  if (!hunk) return 1;
  const context = hunk.lines.findIndex((line) => line.startsWith("+") || line.startsWith("-"));
  return hunk.newStart + Math.max(context, 0);
}

/**
 * The before text of a Claude Code Edit or Write, with the line endings of the
 * file on disk. `originalFile` has LF line endings, but the tool keeps the
 * CRLF endings of the file. So when each line of `after` ends in CRLF, each LF
 * of `original` becomes CRLF. Undefined for a file with mixed line endings.
 */
export function lineEndings(original: string, after: string): string | undefined {
  if (!after.includes("\r\n") || original.includes("\r")) return original;
  const lines = after.split("\n").slice(0, -1);
  if (!lines.every((line) => line.endsWith("\r"))) return undefined;
  return original.replace(/\n/g, "\r\n");
}

/** The edit of a Claude Code Edit result. */
export interface Edit {
  oldString?: string;
  newString?: string;
  replaceAll?: boolean;
}

/**
 * Checks that the old side of each hunk is in `text`. `structuredPatch` shows a
 * tab as two spaces, so the check does too.
 */
function hunksFit(text: string, hunks: Hunk[]): boolean {
  const lines = text.split("\n");
  const norm = (line: string) => line.replace(/\t/g, "  ");
  return hunks.every((hunk) => {
    if (hunk.oldStart === undefined) return false;
    const old = hunk.lines
      .filter((line) => line[0] === " " || line[0] === "-")
      .map((line) => line.slice(1));
    const first = Math.max(hunk.oldStart - 1, 0);
    return old.every((line, i) => norm(lines[first + i] ?? "") === norm(line));
  });
}

/**
 * The text of a file before a Claude Code Edit, rebuilt from the text after
 * it, for a result without `originalFile`. Undoing the hunks alone is wrong,
 * because `structuredPatch` shows a tab as two spaces. So it puts `oldString`
 * back in place of `newString` at an occurrence that overlaps a hunk, or at
 * each such occurrence with `replaceAll`, and checks the old side of each hunk.
 * An occurrence can reach past its hunk, which holds only the changed lines
 * and 3 context lines. Undefined when no occurrence passes, so the rebuild
 * never gives a wrong text.
 */
export function rebuildOriginal(after: string, edit: Edit, hunks: Hunk[]): string | undefined {
  const { oldString, newString, replaceAll } = edit;
  if (oldString === undefined || newString === undefined || !hunks.length) return undefined;
  const starts = [0];
  for (let i = after.indexOf("\n"); i !== -1; i = after.indexOf("\n", i + 1)) starts.push(i + 1);
  const lineOf = (offset: number) => {
    let [low, high] = [0, starts.length - 1];
    while (low < high) {
      const mid = (low + high + 1) >> 1;
      if ((starts[mid] ?? 0) <= offset) low = mid;
      else high = mid - 1;
    }
    return low + 1;
  };
  const ranges = hunks.map((hunk) => {
    const count = hunk.newLines ?? hunk.lines.filter((line) => line[0] !== "-").length;
    return [hunk.newStart, hunk.newStart + Math.max(count, 1) - 1] as const;
  });
  const overlaps = (from: number, to: number) =>
    ranges.some(([first, last]) => lineOf(from) <= last && lineOf(to) >= first);
  const spots: number[] = [];
  if (newString === "") {
    // A deletion leaves no text to find, so each offset of a hunk is a spot.
    if (replaceAll) return undefined;
    for (const [first, last] of ranges)
      for (let i = starts[first - 1] ?? after.length; i <= (starts[last] ?? after.length); i++)
        spots.push(i);
  } else
    for (
      let i = after.indexOf(newString);
      i !== -1;
      i = after.indexOf(newString, i + newString.length)
    )
      if (overlaps(i, i + newString.length - 1)) spots.push(i);
  const build = (at: number[]) => {
    let [text, last] = ["", 0];
    for (const i of at) {
      text += after.slice(last, i) + oldString;
      last = i + newString.length;
    }
    return text + after.slice(last);
  };
  if (replaceAll) {
    const text = build(spots);
    return spots.length && hunksFit(text, hunks) ? text : undefined;
  }
  // Each try copies the file, so a large file with many spots gives up.
  if (spots.length * after.length > 64 * 1024 * 1024) return undefined;
  for (const i of spots) {
    const text = build([i]);
    if (hunksFit(text, hunks)) return text;
  }
  return undefined;
}

/** The result of a Claude Code Edit, Write, or NotebookEdit. */
export interface ToolResult extends Edit {
  type?: string;
  filePath?: string;
  structuredPatch?: Hunk[];
  originalFile?: string | null;
  error?: string;
  original_file?: string;
  updated_file?: string;
}

/**
 * Logs a Claude Code Edit, Write, or NotebookEdit from its result. `file` is
 * the path of the input, against `cwd`; the call ran from `start` to `end`.
 */
export async function recordTool(
  io: Io,
  where: Where,
  tool: string,
  file: string | undefined,
  result: ToolResult | undefined,
  cwd: string,
  start: Date,
  end: Date,
) {
  // A NotebookEdit result holds the file text before and after the call. The
  // after blob comes from the file on disk, because `updated_file` can format
  // the JSON in another way.
  if (tool === "NotebookEdit") {
    if (!file || !result || result.error || result.original_file === undefined) return;
    const line = changedLine(result.original_file ?? "", result.updated_file ?? "");
    const path = resolve(cwd, file);
    return recordFiles(io, where, tool, start, end, [
      { status: "M", path, line, old: result.original_file },
    ]);
  }

  // A successful Edit or Write returns structuredPatch. A failed one returns an error string.
  file ??= result?.filePath;
  if ((tool !== "Edit" && tool !== "Write") || !file || !result?.structuredPatch) return;
  const status = result.type === "create" ? "A" : "M";
  const path = resolve(cwd, file);
  // The text before the call: `originalFile`, else a rebuild of the Edit.
  const after = status === "M" ? await io.read(path) : undefined;
  let old: string | undefined;
  if (after !== undefined) {
    const original =
      result.originalFile ??
      (tool === "Edit"
        ? rebuildOriginal(after.replace(/\r\n/g, "\n"), result, result.structuredPatch)
        : undefined);
    if (original !== undefined) old = lineEndings(original, after);
  }
  await recordFiles(io, where, tool, start, end, [
    { status, path, line: patchLine(result.structuredPatch), old },
  ]);
}
