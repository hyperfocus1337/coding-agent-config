/**
 * omp extension: records the files that a session changes, through the
 * `track` of ./pi.ts with the omp tools. Loaded through `extensions` in the
 * omp config, in place of ./pi.ts: the omp edit result names its files
 * differently, and one edit must give one record.
 *
 * bash, eval, and a write to `xd://resolve`: a git snapshot of the repos
 * before and after the call. `eval` runs Python or JavaScript that can write
 * any file. A write to `xd://resolve` applies an `ast_edit` preview, and the
 * preview itself changes no file (omp 18.12.2, src/tools/resolve.ts:245-251).
 * edit: the files of the tool details, and the files that `path` or `paths`
 * of the input name, read at the call, as the before blobs.
 * write: as in ./pi.ts.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { Change } from "./core.ts";
import { toolPath, track, type Tools } from "./pi.ts";

/** One file of an omp edit result. */
interface EditFile {
  path?: string;
  op?: "create" | "update" | "delete";
  move?: string;
  sourcePath?: string;
  firstChangedLine?: number;
}

/**
 * The files of an omp edit result. A multi-file edit lists them in
 * `perFileResults`. A move logs the old path as D and the new path as A.
 */
export function editFiles(
  details: unknown,
  input: Record<string, unknown>,
  cwd: string,
): Change[] {
  const result = (details ?? {}) as EditFile & { perFileResults?: EditFile[] };
  const files = result.perFileResults ?? [result];
  const changes: Change[] = [];
  for (const file of files) {
    const named =
      file.path ?? (typeof input.path === "string" ? input.path : undefined);
    if (!named) continue;
    const status =
      file.op === "delete"
        ? "D"
        : file.op === "create" || file.move
          ? "A"
          : "M";
    if (file.move && file.sourcePath)
      changes.push({ status: "D", path: toolPath(file.sourcePath, cwd) });
    changes.push({
      status,
      path: toolPath(named, cwd),
      line:
        status === "D"
          ? undefined
          : (file.firstChangedLine ?? (status === "A" ? 1 : undefined)),
    });
  }
  return changes;
}

export const ompTools: Tools = {
  agent: "omp",
  snapshots: (toolName, input) =>
    toolName === "bash" ||
    toolName === "eval" ||
    (toolName === "write" && input.path === "xd://resolve"),
  // A hashline edit of one file sets `path` and `paths`, of more files only
  // `paths` (src/extensibility/tool-event-input.ts:70-91).
  named: ({ path, paths }) => [
    ...new Set(
      [path, ...(Array.isArray(paths) ? paths : [])].filter(
        (file): file is string => typeof file === "string",
      ),
    ),
  ],
  edited: editFiles,
};

export default function (omp: ExtensionAPI) {
  track(omp, ompTools);
}
