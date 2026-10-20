/**
 * omp extension: lints the prose in the files of an omp edit that ./pi.ts
 * does not see, through the same code: the files in `paths` other than
 * `path`. omp sets both for a hashline edit of one file, and only `paths`
 * for more than one file (omp 18.12.2,
 * src/extensibility/tool-event-input.ts:70-91). Loaded through `extensions`
 * in the omp config, after ./pi.ts.
 *
 * Not `eval` or `ast_edit`: a path that code names is not proof of a write,
 * the reason that ./pi.ts skips bash, and `ast_edit` rewrites code.
 */

import { resolve } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { checkFiles } from "./pi.ts";

export default function (omp: ExtensionAPI) {
  omp.on("tool_result", (event, ctx) => {
    // A failed edit wrote nothing.
    if (event.toolName !== "edit" || event.isError) return;
    const { path, paths } = event.input as { path?: unknown; paths?: unknown };
    if (!Array.isArray(paths)) return;
    const files = paths
      .filter((file): file is string => typeof file === "string")
      .filter((file) => file !== path)
      .map((file) => resolve(ctx.cwd, file));
    if (files.length) return checkFiles(files, event.content, ctx);
  });
}
