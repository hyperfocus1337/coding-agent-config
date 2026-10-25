/** Supply approved project Claude skills to pi's native skill loader. */
import * as fs from "node:fs";
import * as path from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function claudeSkills(pi: ExtensionAPI): void {
  let local: string | undefined;
  pi.events.on("claude-project", (root) => {
    local = typeof root === "string" ? root : undefined;
  });
  pi.on("resources_discover", () =>
    local && fs.existsSync(path.join(local, "skills"))
      ? { skillPaths: [path.join(local, "skills")] }
      : undefined,
  );
}
