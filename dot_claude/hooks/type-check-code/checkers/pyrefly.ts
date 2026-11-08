/**
 * pyrefly: `pyrefly check` on the project, for Python. Follows the pyrefly agentic-loop advice
 * (pyrefly.org/blog/pyrefly-agentic-loop): run the checker at the project root and hand the errors
 * to the model.
 */

import type { Checker } from "../core.ts";

export const pyrefly: Checker = {
  key: "pyrefly",
  extensions: ["py"],
  command: async () => ["pyrefly", "check"],
  // pyrefly exits 1 when its config matches no files, which is nothing to check, not a type error.
  noErrors: /No Python files matched/,
  advice:
    "Type check failed. For missing imports, first verify the project configuration, import roots, and Python environment used by Pyrefly before changing imports. Use the project's existing dependency and environment setup. Do not suppress diagnostics or weaken checking to obtain a pass. Fix the cause, rerun the check, then stop. Report any remaining failures.",
};
