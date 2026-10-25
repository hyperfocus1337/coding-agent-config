/**
 * The format-prettier logic: formats the files a tool call changed with one
 * Prettier run, unless format-oxfmt formats them. ./shared.ts finds the
 * files and holds the switch between the two hooks.
 *
 * Adapters: hooks/register.ts (Claude Code mod), pi.ts (pi and omp),
 * command.ts (Codex, and the format-staged-files pre-commit hook).
 * Design notes: README.md.
 */

import {
  format as formatWith,
  type Call,
  type Io,
  type Settings,
} from "./shared.ts";

export type { Call, Io, Settings };

/** The extensions Prettier formats after a Write or an Edit. README "Supported extensions". */
const EDITED =
  /\.(md|markdown|js|jsx|ts|tsx|mts|cts|mjs|cjs|json|css|scss|html|yml|yaml)$/;

/**
 * Formats the files a call changed. Returns the amend hint for the model when
 * the call committed a Markdown file that Prettier then changed, else
 * undefined. README "Write and commit in one command".
 */
export const format = (call: Call, io: Io, settings: Settings) =>
  formatWith(call, io, settings, {
    hook: "format-prettier",
    name: "Prettier",
    edited: EDITED,
    // --prose-wrap preserve keeps one sentence per line. --ignore-path drops
    // .gitignore from the ignore files of Prettier, and keeps .prettierignore.
    // README "Prose wrapping" and "Prettier's own ignore rules".
    argvs: async (files) => [
      [
        "prettier",
        "--write",
        "--prose-wrap",
        "preserve",
        "--ignore-path",
        ".prettierignore",
        ...files,
      ],
    ],
  });
