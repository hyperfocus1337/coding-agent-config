/** Run with node dot_pi/agent/extensions/task-timer/test/check.ts. */
import assert from "node:assert/strict";
import { mock } from "node:test";
import taskTimer from "../index.ts";

const handlers = new Map<string, Function>();
const statuses: (string | undefined)[] = [];
const ctx = {
  mode: "tui",
  ui: {
    setStatus: (key: string, text: string | undefined) => {
      assert.equal(key, "task-timer");
      statuses.push(text);
    },
  },
};
let now = 0;
mock.method(performance, "now", () => now);
mock.timers.enable({ apis: ["setInterval"] });
const emit = (name: string, event = {}) => handlers.get(name)?.(event, ctx);
const advance = (ms: number) => {
  now += ms;
  mock.timers.tick(ms);
};

try {
  taskTimer({ on: (name: string, handler: Function) => handlers.set(name, handler) } as any);
  assert.equal(statuses.length, 0, "No timer starts in the factory");
  emit("agent_settled");
  assert.equal(statuses.length, 0);
  emit("before_agent_start");
  assert.equal(statuses.at(-1), "Working: 0s");
  advance(133_000);
  assert.equal(statuses.at(-1), "Working: 2m 13s");
  emit("agent_end");
  emit("agent_start");
  advance(35_000);
  emit("agent_before_settle", { outcome: "completed" });
  emit("agent_settled", { aborted: false });
  assert.equal(statuses.at(-1), "Completed in 2m 48s", "Retries do not reset the timer");
  let count = statuses.length;
  advance(5000);
  assert.equal(statuses.length, count, "Settlement clears the interval");

  emit("agent_start");
  advance(37_000);
  emit("agent_settled", { aborted: true });
  assert.equal(statuses.at(-1), "Stopped after 37s");

  emit("agent_start");
  advance(1000);
  emit("agent_before_settle", { outcome: "error" });
  emit("agent_settled", { aborted: false });
  assert.equal(statuses.at(-1), "Failed after 1s");

  emit("agent_start");
  advance(3_661_000);
  emit("agent_before_settle", { outcome: "completed" });
  emit("agent_settled", { aborted: false });
  assert.equal(statuses.at(-1), "Completed in 1h 1m 1s");

  emit("agent_start");
  emit("session_shutdown");
  emit("session_shutdown");
  assert.equal(statuses.at(-1), undefined);
  count = statuses.length;
  advance(5000);
  assert.equal(statuses.length, count, "Shutdown clears the interval");
  for (const mode of ["print", "json", "rpc"]) {
    ctx.mode = mode;
    emit("agent_start");
    advance(1000);
    emit("agent_settled", { aborted: false });
    emit("session_shutdown");
    assert.equal(statuses.length, count, `${mode} stays silent`);
  }
  ctx.mode = "tui";
  emit("agent_start");
  emit("agent_settled", { aborted: false });
  assert.equal(statuses.at(-1), "Completed in 0s", "A new activity resets error state");
} finally {
  emit("session_shutdown");
  mock.restoreAll();
  mock.timers.reset();
}
console.log("task-timer checks passed");
