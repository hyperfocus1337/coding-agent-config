/**
 * The Codex part of the core: the files of an apply_patch call, for
 * command.ts. No Node import.
 */

import { resolve, type Change } from "./core.ts";

/**
 * The files of a Codex apply_patch call. Relative paths resolve against `cwd`.
 * A move logs the old path as D and the new path as A.
 */
export function patchFiles(patch: string, cwd: string): Change[] {
  const statuses: Record<string, Change["status"]> = {
    "Add File": "A",
    "Update File": "M",
    "Delete File": "D",
    "Move to": "A",
  };
  const changes: Change[] = [];
  for (const [, verb = "", file = ""] of patch.matchAll(
    /^\*\*\* (Add File|Update File|Delete File|Move to): (.+)$/gm,
  )) {
    const last = changes.at(-1);
    if (verb === "Move to" && last) last.status = "D";
    changes.push({
      status: statuses[verb] ?? "M",
      path: resolve(cwd, file.trim()),
    });
  }
  return changes;
}
