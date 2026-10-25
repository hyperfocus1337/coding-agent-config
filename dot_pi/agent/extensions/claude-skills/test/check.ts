import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import claudeSkills from "../index.ts";

const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "claude-skills-check-"));
try {
  const events = new EventEmitter();
  const handlers = new Map();
  claudeSkills({
    events,
    on(name, handler) {
      handlers.set(name, handler);
    },
  });
  assert.deepEqual([...handlers.keys()], ["resources_discover"]);
  const discover = handlers.get("resources_discover");
  assert.equal(discover(), undefined);
  const root = path.join(fixture, ".claude");
  const skills = path.join(root, "skills");
  fs.mkdirSync(path.join(root, "rules"), { recursive: true });
  events.emit("claude-project", root);
  assert.equal(discover(), undefined);
  fs.mkdirSync(skills);
  assert.deepEqual(discover(), { skillPaths: [skills] });
  assert.deepEqual(discover(), { skillPaths: [skills] });
  fs.rmSync(skills, { recursive: true });
  assert.equal(discover(), undefined);
  events.emit("claude-project", undefined);
  assert.equal(discover(), undefined);
  events.emit("claude-project", {});
  assert.equal(discover(), undefined);
  console.log(
    "8 checks: skills discovery skips missing paths without commands or rules extensions",
  );
} finally {
  fs.rmSync(fixture, { recursive: true, force: true });
}
