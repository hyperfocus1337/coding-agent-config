/**
 * omp extension: aligns the Org tables in the files of the omp calls that
 * ./pi.ts does not see, through the same code. Loaded through `extensions`
 * in the omp config, after ./pi.ts. The calls, from omp 18.12.2:
 *
 * - edit: the files in `paths` other than `path`. omp sets both for a
 *   hashline edit of one file, and only `paths` for more than one file
 *   (src/extensibility/tool-event-input.ts:70-91).
 * - write to `xd://resolve` that applies an `ast_edit` preview: the files
 *   that the apply changed, relative to the session folder
 *   (src/tools/resolve.ts:245-251, src/tools/ast-edit.ts:491-502). The
 *   preview itself changes no file.
 * - eval: the Python or JavaScript code, as the command of a bash call.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { Call } from "./core.ts";
import { absolute, alignCalls } from "./pi.ts";

export default function (omp: ExtensionAPI) {
  omp.on("tool_result", (event, ctx) =>
    alignCalls(
      ompCalls(event.toolName, event.input, event.details, ctx.cwd),
      event.content,
    ),
  );
}

/** The details of a write to `xd://resolve` (src/tools/resolve.ts:110-127). */
interface Resolve {
  xdev?: {
    tool?: unknown;
    inner?: {
      action?: unknown;
      sourceToolName?: unknown;
      sourceResultDetails?: { applied?: unknown; files?: unknown };
    };
  };
}

const strings = (value: unknown) =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];

/** The calls of an omp tool result that ./pi.ts does not align. */
function ompCalls(
  tool: string,
  input: Record<string, unknown>,
  details: unknown,
  cwd: string,
): Call[] {
  const file = (path: string): Call => ({ filePath: absolute(path, cwd), cwd });
  if (tool === "eval")
    return typeof input.code === "string" ? [{ command: input.code, cwd }] : [];
  if (tool === "edit")
    return strings(input.paths)
      .filter((path) => path !== input.path)
      .map(file);
  if (tool !== "write" || input.path !== "xd://resolve") return [];
  const xdev = (details as Resolve | undefined)?.xdev;
  const inner = xdev?.inner;
  if (
    xdev?.tool !== "resolve" ||
    inner?.action !== "apply" ||
    inner.sourceToolName !== "ast_edit" ||
    inner.sourceResultDetails?.applied !== true
  )
    return [];
  return strings(inner.sourceResultDetails.files).map(file);
}
