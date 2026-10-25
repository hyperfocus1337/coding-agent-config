import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";

const PROVIDER = "openai-codex";
const URL = "https://chatgpt.com/backend-api/wham/usage";
const KEYS = ["codex-session", "codex-weekly"] as const;

type Window = { percent: number; resetAt?: number };
type Usage = { session?: Window; weekly?: Window };

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

export function parseUsage(value: unknown, now = Date.now()): Usage {
  const limits = record(record(value)?.rate_limit);
  const usage: Usage = {};
  for (const value of [limits?.primary_window, limits?.secondary_window]) {
    const window = record(value);
    if (!window) continue;
    const percent = window.used_percent;
    const seconds = window.limit_window_seconds;
    if (
      typeof percent !== "number" ||
      !Number.isFinite(percent) ||
      percent < 0 ||
      percent > 100
    )
      continue;
    const key =
      seconds === 18000 ? "session" : seconds === 604800 ? "weekly" : undefined;
    if (!key) continue;
    const reset = window.reset_at;
    const after = window.reset_after_seconds;
    const resetAt =
      typeof reset === "number" && Number.isFinite(reset) && reset > 0
        ? reset * 1000
        : typeof after === "number" && Number.isFinite(after) && after >= 0
          ? now + after * 1000
          : undefined;
    usage[key] = { percent, resetAt };
  }
  if (!usage.session && !usage.weekly)
    throw new Error("No supported Codex quota windows");
  return usage;
}

export function status(
  label: string,
  window?: Window,
  now = Date.now(),
): string {
  return `${label} ${
    window && (window.resetAt === undefined || window.resetAt > now)
      ? `${Math.round(window.percent)}%`
      : "--"
  }`;
}

function claims(token: string): Record<string, unknown> | undefined {
  try {
    return record(
      JSON.parse(
        atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")),
      ),
    );
  } catch {
    return undefined;
  }
}

export function accountId(token: string): string | undefined {
  const id = record(
    claims(token)?.["https://api.openai.com/auth"],
  )?.chatgpt_account_id;
  return typeof id === "string" && /^[\w-]+$/.test(id) ? id : undefined;
}

export function clientId(token: string): string | undefined {
  const payload = claims(token);
  const id = payload?.client_id;
  return payload?.iss === "https://auth.openai.com" &&
    payload?.aud === "https://api.openai.com/v1" &&
    typeof payload.scope === "string" &&
    payload.scope.split(/\s+/).includes("chatgpt.tokens.use.direct") &&
    typeof id === "string" &&
    /^oaiapp_[\w-]+$/.test(id)
    ? id
    : undefined;
}

export function matchesApp(value: unknown, id: string): boolean {
  const items = record(value)?.items;
  return (
    Array.isArray(items) &&
    items.filter((item) => record(item)?.id === id).length === 1
  );
}

async function readJson(
  url: string,
  token: string,
  id: string,
  signal: AbortSignal,
): Promise<unknown> {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, "ChatGPT-Account-Id": id },
    redirect: "error",
    signal,
  });
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(`Codex usage HTTP ${response.status}`);
  }
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Empty Codex usage response");
  const decoder = new TextDecoder();
  let text = "";
  let bytes = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 65536) throw new Error("Codex usage response too large");
      text += decoder.decode(value, { stream: true });
    }
    return JSON.parse(text + decoder.decode());
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

export async function readUsage(
  token: string,
  id: string,
  signal: AbortSignal,
): Promise<Usage> {
  return parseUsage(await readJson(URL, token, id, signal));
}

function supported(ctx: ExtensionContext): boolean {
  return (
    ctx.mode === "tui" &&
    (ctx.model?.provider === PROVIDER || ctx.model?.provider === "openai")
  );
}

export default function codexUsage(pi: ExtensionAPI): void {
  let timer: ReturnType<typeof setInterval> | undefined;
  let pending: AbortController | undefined;
  let generation = 0;
  let lastCheck = 0;

  function clear(ctx: ExtensionContext): void {
    generation++;
    if (timer) clearInterval(timer);
    timer = undefined;
    pending?.abort();
    pending = undefined;
    lastCheck = 0;
    for (const key of KEYS) ctx.ui.setStatus(key, undefined);
  }

  async function refresh(ctx: ExtensionContext, force = false): Promise<void> {
    if (!supported(ctx) || !ctx.model) return;
    if (pending || (!force && Date.now() - lastCheck < 60000)) return;
    lastCheck = Date.now();
    const current = generation;
    const controller = new AbortController();
    pending = controller;
    const timeout = setTimeout(() => controller.abort(), 10000);
    let failure = "Codex usage unavailable. Check /login or try again later.";
    let needsLogin = false;
    try {
      const modern = ctx.model.provider === "openai";
      let app: string | undefined;
      if (modern) {
        failure =
          "Usage requires the official OpenAI subscription login, not an API key or proxy.";
        if (!ctx.modelRegistry.isUsingOAuth(ctx.model)) throw new Error();
        const active = (await ctx.modelRegistry.getProviderAuth("openai"))
          ?.auth;
        for (const baseUrl of [active?.baseUrl, ctx.model.baseUrl]) {
          if (
            baseUrl &&
            new globalThis.URL(baseUrl).origin !== "https://api.openai.com"
          )
            throw new Error();
        }
        app = active?.apiKey && clientId(active.apiKey);
        if (!app) throw new Error();
      }
      const backend = modern
        ? ctx.modelRegistry
            .getAll()
            .find((model) => model.provider === PROVIDER)
        : ctx.model;
      failure =
        "Run /login, select OpenAI Codex (legacy), and use the same ChatGPT account/workspace as OpenAI. Keep your current model.";
      needsLogin = true;
      if (!backend || !ctx.modelRegistry.isUsingOAuth(backend))
        throw new Error();
      const auth = (await ctx.modelRegistry.getProviderAuth(PROVIDER))?.auth;
      const token = auth?.apiKey;
      const id = token && accountId(token);
      if (!token || !id) throw new Error();
      needsLogin = false;
      failure = "Usage checks reject custom Codex origins.";
      // Only the backend credential is sent to ChatGPT; the app token stays local.
      for (const baseUrl of [auth?.baseUrl, backend.baseUrl]) {
        if (
          baseUrl &&
          new globalThis.URL(baseUrl).origin !== "https://chatgpt.com"
        )
          throw new Error();
      }
      failure = "Codex usage unavailable. Check /login or try again later.";
      if (app) {
        const apps = await readJson(
          `${URL}/chatpass/apps`,
          token,
          id,
          controller.signal,
        );
        failure =
          "OpenAI app not found in the quota account. Sign in to OpenAI and OpenAI Codex (legacy) with the same ChatGPT account/workspace.";
        if (!matchesApp(apps, app)) throw new Error();
        failure = "Codex usage unavailable. Check /login or try again later.";
      }
      const usage = await readUsage(token, id, controller.signal);
      if (current !== generation) return;
      ctx.ui.setStatus(KEYS[0], status("Session", usage.session));
      ctx.ui.setStatus(KEYS[1], status("Weekly", usage.weekly));
    } catch {
      if (current !== generation) return;
      ctx.ui.setStatus(
        KEYS[0],
        needsLogin ? "Session: login required" : "Session --",
      );
      ctx.ui.setStatus(KEYS[1], "Weekly --");
      if (force) ctx.ui.notify(failure, "warning");
    } finally {
      clearTimeout(timeout);
      if (pending === controller) pending = undefined;
    }
  }

  function start(ctx: ExtensionContext): void {
    clear(ctx);
    if (!supported(ctx)) return;
    ctx.ui.setStatus(KEYS[0], "Session --");
    ctx.ui.setStatus(KEYS[1], "Weekly --");
    void refresh(ctx);
    timer = setInterval(() => {
      void refresh(ctx);
    }, 300000);
  }

  pi.on("session_start", (_event, ctx) => start(ctx));
  pi.on("model_select", (_event, ctx) => start(ctx));
  pi.on("agent_end", (_event, ctx) => {
    void refresh(ctx);
  });
  pi.on("session_shutdown", (_event, ctx) => clear(ctx));
  pi.registerCommand("codex-usage", {
    description: "Refresh Codex session and weekly quota percentages",
    handler: async (_args, ctx) => {
      if (
        ctx.model?.provider !== PROVIDER &&
        ctx.model?.provider !== "openai"
      ) {
        ctx.ui.notify("Select an OpenAI or Codex model first.", "info");
        return;
      }
      await refresh(ctx, true);
    },
  });
}
