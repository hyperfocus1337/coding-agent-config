/**
 * Self-check for ../apply-patch.ts. A stub command.ts stands in for a hook: it
 * logs the tool name and file_path it gets, and exits with the code that the
 * file holds.
 *
 * Run: node test/apply-patch.ts, from dot_codex/hooks.
 */

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

const wrapper = path.join(import.meta.dirname, "..", "apply-patch.ts");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "apply-patch-test-"));
const log = path.join(tmp, "log");
const stub = path.join(tmp, "stub.ts");
fs.writeFileSync(
  stub,
  `import { appendFileSync, readFileSync } from "node:fs";
const payload = JSON.parse(readFileSync(0, "utf8"));
const file = payload.tool_input.file_path;
appendFileSync(process.env.LOG, \`\${payload.tool_name} \${file}\\n\`);
process.exitCode = Number(readFileSync(file, "utf8")) || 0;
`,
);

let failures = 0;
function check(what: string, patch: string, status: number, files: string[]) {
  fs.writeFileSync(log, "");
  const ran = spawnSync(process.execPath, [wrapper, stub], {
    input: JSON.stringify({
      hook_event_name: "PostToolUse",
      cwd: tmp,
      tool_name: "apply_patch",
      tool_input: { command: patch },
    }),
    encoding: "utf8",
    env: { ...process.env, LOG: log },
  });
  try {
    assert.equal(ran.status, status, ran.stderr);
    const logged = fs.readFileSync(log, "utf8").split("\n").filter(Boolean);
    assert.deepEqual(
      logged.sort(),
      files.map((file) => `Write ${path.join(tmp, file)}`).sort(),
    );
  } catch (error) {
    failures += 1;
    console.error(`FAIL ${what}\n  ${(error as Error).message}`);
  }
}
const write = (file: string, code: number) =>
  fs.writeFileSync(path.join(tmp, file), `${code}\n`);

// Add, Update, Delete, and Update with Move to; one relative path with a space.
fs.mkdirSync(path.join(tmp, "sub dir"));
write("added.md", 0);
write("sub dir/updated.md", 0);
write("moved.md", 0);
check(
  "one Write per written file, deleted and old side skipped",
  `*** Begin Patch
*** Add File: added.md
+0
*** Update File: sub dir/updated.md
@@
-x
+0
*** Delete File: ${tmp}/deleted.md
*** Update File: ${tmp}/old.md
*** Move to: ${tmp}/moved.md
@@
-x
+0
*** Update File: added.md
*** End Patch`,
  0,
  ["added.md", "moved.md", "sub dir/updated.md"],
);

write("a.md", 2);
write("b.md", 127);
check(
  "exit 2 wins over a higher code",
  "*** Add File: a.md\n*** Add File: b.md",
  2,
  ["a.md", "b.md"],
);

write("a.md", 1);
write("b.md", 0);
check(
  "highest code wins without a block",
  "*** Add File: a.md\n*** Add File: b.md",
  1,
  ["a.md", "b.md"],
);

check("no file lines, no hook run", "not a patch", 0, []);

const bare = spawnSync(process.execPath, [wrapper], {
  input: "{}",
  encoding: "utf8",
});
if (bare.status !== 1) {
  failures += 1;
  console.error(`FAIL missing hook argument fails\n  exit ${bare.status}`);
}

fs.rmSync(tmp, { recursive: true, force: true });
if (failures > 0) process.exit(1);
console.log("all pass");
