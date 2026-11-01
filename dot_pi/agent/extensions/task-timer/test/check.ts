/** Run with node dot_pi/agent/extensions/task-timer/test/check.ts. */
import assert from "node:assert/strict";
import { mock } from "node:test";
import taskTimer from "../index.ts";

const handlers = new Map<string, Function>();
const statuses: (string | undefined)[] = [];
let toggle: Function;
const notifications: string[] = [];
const ctx = {
  mode: "tui",
  ui: {
    notify: (text: string) => notifications.push(text),
    setStatus: (key: string, text: string | undefined) => {
      assert.equal(key, "task-timer");
      statuses.push(text);
    },
  },
};
let now = 0;
mock.method(performance, "now", () => now);
const emit = (name: string, event = {}) => handlers.get(name)?.(event, ctx);
const advance = (ms: number) => {
  now += ms;
  mock.timers.tick(ms);
};

for (const showSeconds of [undefined, false, true]) {
  now = 0;
  statuses.length = 0;
  handlers.clear();
  mock.timers.enable({ apis: ["setInterval"] });
  try {
    taskTimer({
      on: (name: string, handler: Function) => handlers.set(name, handler),
      registerCommand: (name: string, options: { handler: Function }) => {
        assert.equal(name, "task-timer");
        toggle = options.handler;
      },
      registerFlag: (name: string, options: unknown) => {
        assert.equal(name, "task-timer-seconds");
        assert.deepEqual(options, {
          description: "Show seconds in the task timer",
          type: "boolean",
          default: false,
        });
      },
      getFlag: (name: string) => {
        assert.equal(name, "task-timer-seconds");
        return showSeconds;
      },
    } as any);
    assert.equal(statuses.length, 0, "No timer starts in the factory");
    toggle!("", ctx);
    assert.equal(notifications.at(-1), `Task timer seconds: ${showSeconds ? "off" : "on"}`);
    toggle!("", ctx);
    assert.equal(statuses.length, 0, "Toggling before a task does not create a status");
    emit("agent_settled");
    assert.equal(statuses.length, 0);
    emit("before_agent_start");
    assert.equal(statuses.at(-1), showSeconds ? "Working: 0s" : "Working: <1m");
    const initialCount = statuses.length;
    advance(1000);
    assert.equal(statuses.length, initialCount + (showSeconds ? 1 : 0));
    advance(58_999);
    assert.equal(statuses.at(-1), showSeconds ? "Working: 59s" : "Working: <1m");
    advance(1);
    assert.equal(statuses.at(-1), showSeconds ? "Working: 1m 0s" : "Working: 1m");
    advance(73_000);
    assert.equal(statuses.at(-1), showSeconds ? "Working: 2m 13s" : "Working: 2m");
    emit("agent_end");
    emit("agent_start");
    advance(35_000);
    emit("agent_before_settle", { outcome: "completed" });
    emit("agent_settled", { aborted: false });
    assert.equal(
      statuses.at(-1),
      showSeconds ? "Completed in 2m 48s" : "Completed in 2m",
      "Retries do not reset the timer",
    );
    let count = statuses.length;
    advance(5000);
    assert.equal(statuses.length, count, "Settlement clears the interval");

    emit("agent_start");
    advance(37_000);
    emit("agent_settled", { aborted: true });
    assert.equal(statuses.at(-1), showSeconds ? "Stopped after 37s" : "Stopped after <1m");

    emit("agent_start");
    advance(1000);
    emit("agent_before_settle", { outcome: "error" });
    emit("agent_settled", { aborted: false });
    assert.equal(statuses.at(-1), showSeconds ? "Failed after 1s" : "Failed after <1m");

    emit("agent_start");
    advance(3_600_000);
    assert.equal(statuses.at(-1), showSeconds ? "Working: 1h 0m 0s" : "Working: 1h 0m");
    advance(61_000);
    emit("agent_before_settle", { outcome: "completed" });
    emit("agent_settled", { aborted: false });
    assert.equal(statuses.at(-1), showSeconds ? "Completed in 1h 1m 1s" : "Completed in 1h 1m");

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
    assert.equal(
      statuses.at(-1),
      showSeconds ? "Completed in 0s" : "Completed in <1m",
      "A new activity resets error state",
    );

    toggle!("", ctx);
    assert.equal(statuses.at(-1), showSeconds ? "Completed in <1m" : "Completed in 0s");
    count = statuses.length;
    advance(5000);
    assert.equal(statuses.length, count, "Toggling a final status does not start an interval");
    emit("agent_start");
    advance(1000);
    assert.equal(
      statuses.at(-1),
      showSeconds ? "Working: <1m" : "Working: 1s",
      "The toggle persists into the next task",
    );
    toggle!("", ctx);
    assert.equal(statuses.at(-1), showSeconds ? "Working: 1s" : "Working: <1m");
    count = statuses.length;
    advance(1000);
    assert.equal(
      statuses.length,
      count + (showSeconds ? 1 : 0),
      "Toggling changes update frequency",
    );
    emit("agent_settled", { aborted: false });
    assert.equal(
      statuses.at(-1),
      showSeconds ? "Completed in 2s" : "Completed in <1m",
      "Toggling does not reset elapsed time",
    );
  } finally {
    emit("session_shutdown");
    mock.timers.reset();
  }
}
mock.restoreAll();
console.log("task-timer checks passed");
