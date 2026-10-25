import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import cmuxState from "../index.ts";

const directory = mkdtempSync(join(tmpdir(), "cmux-state-check-"));
const original = process.env.CMUX_PI_STATE_FILE;
const handlers = new Map();
try {
  delete process.env.CMUX_PI_STATE_FILE;
  cmuxState({
    on(name, handler) {
      handlers.set(name, handler);
    },
  });
  assert.equal(handlers.size, 0, "inactive outside the host bridge");
  process.env.CMUX_PI_STATE_FILE = join(directory, "state");
  cmuxState({
    on(name, handler) {
      handlers.set(name, handler);
    },
  });
  const state = () => readFileSync(process.env.CMUX_PI_STATE_FILE!, "utf8");
  handlers.get("session_start")();
  assert.equal(state(), "idle\n");
  handlers.get("agent_start")();
  assert.equal(state(), "running\n");
  assert.equal(handlers.has("agent_end"), false, "low-level completion is not idle");
  handlers.get("agent_settled")({}, { isIdle: () => false });
  assert.equal(state(), "running\n");
  handlers.get("agent_settled")({}, { isIdle: () => true });
  assert.equal(state(), "idle\n");
  handlers.get("session_shutdown")();
  assert.equal(state(), "closed\n");
  handlers.get("session_shutdown")();
  assert.equal(state(), "closed\n", "shutdown is idempotent");
  handlers.get("session_start")();
  assert.equal(state(), "idle\n", "reload reopens the bridge");
  rmSync(directory, { recursive: true });
  const warn = console.warn;
  const warnings: unknown[] = [];
  try {
    console.warn = (message) => {
      warnings.push(message);
    };
    handlers.get("agent_start")();
    handlers.get("session_shutdown")();
    assert.equal(warnings.length, 1, "transport failure does not stop Pi or repeat warnings");
  } finally {
    console.warn = warn;
  }
  console.log("PASS: cmux lifecycle publication, settlement, reload, and failure handling");
} finally {
  if (original === undefined) delete process.env.CMUX_PI_STATE_FILE;
  else process.env.CMUX_PI_STATE_FILE = original;
  rmSync(directory, { recursive: true, force: true });
}
