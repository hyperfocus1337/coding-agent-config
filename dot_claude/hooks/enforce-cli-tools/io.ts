/**
 * The inputs of ./core.ts under Node, for command.ts and pi.ts. The mod reads
 * the same files through `$` in hooks/register.ts.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { allowList, parseRules } from "./core.ts";

/** A file's text, or "" when it is missing: a missing file allows. */
const read = (file: string | URL) => {
  try {
    return readFileSync(file, "utf8");
  } catch {
    return "";
  }
};

/** The rules beside this file, and the allowlist of the repo at `root`. */
export function inputs(root: string) {
  return {
    // import.meta.url is the real path, also when pi loads pi.ts through a link.
    rules: parseRules(read(new URL("./rules", import.meta.url))),
    allowed: allowList(
      read(join(root, ".claude-allow-cli-tools")),
      process.env.CLAUDE_ALLOW_CLI_TOOLS,
    ),
  };
}
