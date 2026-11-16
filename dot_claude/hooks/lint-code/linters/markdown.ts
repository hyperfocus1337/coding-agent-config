import type { Linter } from "../core.ts";

/**
 * rumdl with the rules for content errors that a formatter cannot see: MD056, a table row with
 * more or fewer cells than the header, MD057, a relative link to a file that does not exist, and
 * MD051, a link to a heading that does not exist. oxfmt aligns a short row and keeps its cell
 * count, so nothing else reports a pipe that an edit dropped. --no-config and the explicit list
 * keep the style rules out, because oxfmt owns the format, and --no-cache writes no .rumdl_cache
 * folder into the repository. --quiet drops the hint to run `rumdl fmt`: that fix adds an empty
 * cell at the end of a short row, not the pipe where it belongs.
 */
export const markdown: Linter = {
  key: "md",
  extensions: ["md", "markdown"],
  tools: ["rumdl"],
  command: async (file) => ({
    argv: [
      "rumdl",
      "check",
      "--no-config",
      "--no-cache",
      "--enable",
      "MD056,MD057,MD051",
      "--color",
      "never",
      "--quiet",
      file,
    ],
  }),
};
