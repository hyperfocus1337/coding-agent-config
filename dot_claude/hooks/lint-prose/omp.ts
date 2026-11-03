/**
 * omp extension: the `lint` of ./pi.ts with the omp shell tools. Loaded
 * through `extensions` in the omp config in place of ./pi.ts, after the omp
 * extension of track-session-changes, whose log names the files of a shell
 * call.
 *
 * `eval` runs Python or JavaScript that can write any file, so it counts as
 * a shell. Not `ast_edit`: it rewrites code, and its write to `xd://resolve`
 * names no prose file.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { lint } from "./pi.ts";

export default function (omp: ExtensionAPI) {
  lint(omp, "omp", ["bash", "eval"]);
}
