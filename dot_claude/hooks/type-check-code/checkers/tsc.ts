/** tsc: `tsc --noEmit` on the project, for TypeScript. */

import type { Checker } from "../core.ts";

export const tsc: Checker = {
  key: "tsc",
  extensions: ["ts", "tsx", "mts", "cts"],
  // tsc with no tsconfig.json prints its whole help text and exits 1.
  command: async (root, io) =>
    (await io.isFile(`${root}/tsconfig.json`)) ? ["tsc", "--noEmit"] : undefined,
  advice:
    "Type check failed. Fix the errors above, rerun the relevant checks, then stop. Report any remaining failures.",
};
