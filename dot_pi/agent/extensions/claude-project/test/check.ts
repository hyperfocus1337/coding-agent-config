import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import claudeProject, { projectRoot } from "../index.ts";

const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "claude-project-check-"));
const argv = [...process.argv];
try {
  assert.equal(projectRoot(cwd), undefined);
  assert.equal(projectRoot(os.homedir()), undefined);
  const root = path.join(cwd, ".claude");
  for (const kind of ["commands", "rules", "skills"]) {
    fs.mkdirSync(path.join(root, kind), { recursive: true });
    assert.equal(projectRoot(cwd), root);
    fs.rmSync(path.join(root, kind), { recursive: true });
  }
  fs.mkdirSync(path.join(root, "skills"));
  const handlers = new Map();
  const announcements = [];
  claudeProject({
    on(name, handler) {
      handlers.set(name, handler);
    },
    events: {
      emit(name, root) {
        announcements.push({ name, root });
      },
    },
  });
  assert.deepEqual([...handlers.keys()], ["session_start"]);
  process.argv = [...argv, "--approve"];
  await handlers.get("session_start")({}, { cwd });
  assert.deepEqual(announcements, [{ name: "claude-project", root }]);
  process.argv = [...argv, "--no-approve"];
  await handlers.get("session_start")({}, { cwd });
  assert.deepEqual(announcements.at(-1), {
    name: "claude-project",
    root: undefined,
  });
  assert.equal(announcements.length, 2);
  console.log("PASS: project discovery and approval coordination");
} finally {
  process.argv = argv;
  fs.rmSync(cwd, { recursive: true, force: true });
}
