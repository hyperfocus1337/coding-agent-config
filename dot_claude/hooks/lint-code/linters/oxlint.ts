import type { Linter } from "../core.ts";

/** oxlint finds its own config. --deny-warnings makes a warning fail the check. */
export const oxlint: Linter = {
  key: "js",
  extensions: ["js", "jsx", "ts", "tsx", "mjs", "cjs", "mts", "cts"],
  tools: ["oxlint"],
  command: async (file) => ({ argv: ["oxlint", "--deny-warnings", file] }),
};
