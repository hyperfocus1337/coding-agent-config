import type { Linter } from "../core.ts";

/**
 * rumdl with only the rules for content errors that a formatter cannot see, such as a broken link
 * or a table row with a missing cell. docs/linters/markdown.md gives the reason for each rule that
 * is in or out of the list. --no-config and the explicit list keep the style rules out, because
 * oxfmt owns the format, and --no-cache writes no .rumdl_cache folder into the repository.
 * --quiet drops the hint to run `rumdl fmt`: that fix adds an empty cell at the end of a short
 * row, not the pipe where it belongs.
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
      "MD011,MD042,MD045,MD051,MD052,MD056,MD057,MD066,MD068,MD070,MD083,MD084,MD086,MD091,MD092,MD094,MD095",
      "--color",
      "never",
      "--quiet",
      file,
    ],
  }),
};
