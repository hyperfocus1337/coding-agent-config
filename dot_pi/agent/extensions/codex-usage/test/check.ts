import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import codexUsage, { accountId, clientId, matchesApp, parseUsage, readUsage, status } from "../index.ts";

const token = `header.${btoa(JSON.stringify({ "https://api.openai.com/auth": { chatgpt_account_id: "test-account" } }))}.signature`;
const appToken = `header.${btoa(JSON.stringify({ iss: "https://auth.openai.com", aud: "https://api.openai.com/v1", scope: "openid chatgpt.tokens.use.direct", client_id: "oaiapp_test" }))}.signature`;
assert.equal(clientId(appToken), "oaiapp_test");
assert.equal(clientId(token), undefined);
assert.equal(clientId("invalid"), undefined);
assert.ok(matchesApp({ items: [{ id: "oaiapp_test" }] }, "oaiapp_test"));
assert.ok(!matchesApp({ items: [{ id: "oaiapp_other" }] }, "oaiapp_test"));
assert.ok(!matchesApp({ items: [{ id: "oaiapp_test" }, { id: "oaiapp_test" }] }, "oaiapp_test"));
assert.ok(!matchesApp({}, "oaiapp_test"));
const window = (percent, seconds, reset = 2000000000) => ({ used_percent: percent, limit_window_seconds: seconds, reset_at: reset });
const payload = { rate_limit: { primary_window: window(36.4, 18000), secondary_window: window(12, 604800) } };
const parsed = parseUsage(payload);
assert.equal(status("Session", parsed.session, 0), "Session 36%");
assert.equal(status("Weekly", parsed.weekly, 0), "Weekly 12%");
assert.equal(status("Session", parsed.session, 2000000000000), "Session --");
assert.equal(status("Weekly"), "Weekly --");
assert.equal(accountId(token), "test-account");
assert.equal(accountId("invalid"), undefined);
assert.equal(accountId(`h.${btoa('{}')}.s`), undefined);
assert.deepEqual(parseUsage({ rate_limit: { primary_window: window(9, 604800) } }), {
  weekly: { percent: 9, resetAt: 2000000000000 },
});
assert.deepEqual(parseUsage({ rate_limit: { secondary_window: { ...window(0, 18000), reset_at: undefined, reset_after_seconds: 60 } } }, 1000), {
  session: { percent: 0, resetAt: 61000 },
});
for (const value of [null, {}, { rate_limit: { primary_window: window("0", 18000) } },
  { rate_limit: { primary_window: window(101, 18000) } }, { rate_limit: { primary_window: window(5, 3600) } }]) {
  assert.throws(() => parseUsage(value), /No supported/);
}

const originalFetch = globalThis.fetch;
let calls = 0;
globalThis.fetch = async (url, options) => {
  calls++;
  assert.equal(url, "https://chatgpt.com/backend-api/wham/usage");
  assert.equal(options.redirect, "error");
  assert.equal(options.headers.Authorization, `Bearer ${token}`);
  assert.equal(options.headers["ChatGPT-Account-Id"], "test-account");
  return Response.json(payload);
};
const handlers = new Map();
const commands = new Map();
const statuses = new Map();
const notifications = [];
const ctx = {
  mode: "tui", model: { provider: "openai-codex" },
  modelRegistry: {
    isUsingOAuth: () => true,
    getAll: () => [{ provider: "openai-codex", baseUrl: "https://chatgpt.com/backend-api" }],
    getProviderAuth: async () => ({ auth: { apiKey: token, baseUrl: "https://chatgpt.com/backend-api" } }),
  },
  ui: {
    setStatus: (key, value) => value === undefined ? statuses.delete(key) : statuses.set(key, value),
    notify: (message) => notifications.push(message),
  },
};
const flush = () => new Promise((resolve) => setTimeout(resolve, 20));
try {
  assert.deepEqual(await readUsage(token, "test-account", new AbortController().signal), parsed);
  codexUsage({ on: (event, handler) => handlers.set(event, handler), registerCommand: (name, command) => commands.set(name, command) });
  handlers.get("session_start")({}, ctx);
  await flush();
  assert.equal(statuses.get("codex-session"), "Session 36%");
  assert.equal(statuses.get("codex-weekly"), "Weekly 12%");
  const before = calls;
  handlers.get("agent_end")({}, ctx);
  await flush();
  assert.equal(calls, before, "turn refresh is throttled");
  await commands.get("codex-usage").handler("", ctx);
  assert.equal(calls, before + 1, "manual refresh bypasses throttle");
  ctx.model = { provider: "anthropic" };
  handlers.get("model_select")({}, ctx);
  assert.equal(statuses.size, 0);
  assert.equal(calls, before + 1, "other providers are never checked");

  ctx.model = { provider: "openai-codex" };
  ctx.modelRegistry.getProviderAuth = async () => ({ auth: { apiKey: token, baseUrl: "https://example.com" } });
  handlers.get("model_select")({}, ctx);
  await flush();
  assert.equal(calls, before + 1, "custom-origin auth never reaches official endpoint");
  assert.equal(statuses.get("codex-session"), "Session --");
  ctx.modelRegistry.getProviderAuth = async () => ({ auth: { apiKey: token } });
  globalThis.fetch = async () => new Response("denied", { status: 401 });
  await commands.get("codex-usage").handler("", ctx);
  assert.equal(statuses.get("codex-weekly"), "Weekly --");
  assert.equal(notifications.length, 1);
  globalThis.fetch = async () => new Response("x".repeat(65537));
  await assert.rejects(readUsage(token, "test-account", new AbortController().signal), /too large/);

  let release;
  globalThis.fetch = () => new Promise((resolve) => { release = resolve; });
  handlers.get("model_select")({}, ctx);
  await flush();
  ctx.model = { provider: "anthropic" };
  handlers.get("model_select")({}, ctx);
  release(Response.json(payload));
  await flush();
  assert.equal(statuses.size, 0, "late responses cannot republish after model switch");
  ctx.model = { provider: "openai", baseUrl: "https://api.openai.com/v1" };
  ctx.modelRegistry.getProviderAuth = async (provider) => provider === "openai"
    ? { auth: { apiKey: appToken } } : undefined;
  handlers.get("model_select")({}, ctx);
  await flush();
  assert.equal(statuses.get("codex-session"), "Session: login required");
  await commands.get("codex-usage").handler("", ctx);
  assert.match(notifications.at(-1), /OpenAI Codex \(legacy\).*same ChatGPT/);

  ctx.modelRegistry.getProviderAuth = async (provider) => ({ auth: { apiKey: provider === "openai" ? appToken : token } });
  const modernRequests = [];
  let apps = { items: [{ id: "oaiapp_test" }] };
  globalThis.fetch = async (url, options) => {
    modernRequests.push(url);
    assert.equal(options.headers.Authorization, `Bearer ${token}`, "OpenAI app token is never sent to ChatGPT");
    assert.equal(options.headers["ChatGPT-Account-Id"], "test-account");
    assert.equal(options.redirect, "error");
    return Response.json(url.endsWith("/chatpass/apps") ? apps : payload);
  };
  await commands.get("codex-usage").handler("", ctx);
  assert.deepEqual(modernRequests, [
    "https://chatgpt.com/backend-api/wham/usage/chatpass/apps",
    "https://chatgpt.com/backend-api/wham/usage",
  ]);
  assert.equal(statuses.get("codex-session"), "Session 36%");
  assert.equal(statuses.get("codex-weekly"), "Weekly 12%");

  apps = { items: [{ id: "oaiapp_other" }] };
  modernRequests.length = 0;
  await commands.get("codex-usage").handler("", ctx);
  assert.equal(statuses.get("codex-session"), "Session --");
  assert.equal(modernRequests.length, 1, "mismatched account never reaches plan quota read");
  assert.match(notifications.at(-1), /app not found/);
  ctx.modelRegistry.isUsingOAuth = () => false;
  modernRequests.length = 0;
  await commands.get("codex-usage").handler("", ctx);
  assert.equal(modernRequests.length, 0, "OpenAI API-key auth is not sent to quota endpoints");
  ctx.modelRegistry.isUsingOAuth = () => true;
  ctx.model.baseUrl = "https://example.com";
  await commands.get("codex-usage").handler("", ctx);
  assert.equal(modernRequests.length, 0, "OpenAI proxy origin is rejected");
  ctx.mode = "print";
  ctx.model = { provider: "openai-codex" };
  handlers.get("session_start")({}, ctx);
  assert.equal(statuses.size, 0, "non-TUI sessions do not poll");
} finally {
  handlers.get("session_shutdown")?.({}, ctx);
  globalThis.fetch = originalFetch;
}

const config = JSON.parse(readFileSync(new URL("../../pi-footer.json", import.meta.url), "utf8"));
for (const key of ["codex-session", "codex-weekly"]) {
  const widget = config.lines[2].find((item) => item.id === key);
  assert.equal(widget.type, "external-status");
  assert.equal(widget.options.externalStatusKey, key);
  assert.ok(config.extensionStatusRow.hiddenKeys.includes(key));
}
console.log("codex-usage: parsing, HTTP bounds, lifecycle, auth boundary, and footer checks passed");
