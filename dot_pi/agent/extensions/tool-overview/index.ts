/** Live per-batch tool overviews, inspired by pi-tool-display-intent's Run ledger.
 * Display only: no tool overrides, schema changes, result edits, or prompt changes.
 * One extra model request per completed batch; no requests in headless modes.
 */
import type {
  ExtensionAPI,
  ExtensionContext,
  ToolRenderers,
  MessageUpdateEvent,
  MessageEndEvent,
} from "@earendil-works/pi-coding-agent";
import {
  Container,
  MouseRegion,
  Text,
  replaceControlCharacters,
  stripTerminalSequences,
} from "@earendil-works/pi-tui";
import { acceptSummary, type Call, duration, evidence, fallback, instructions } from "./summary.ts";

interface Batch {
  calls: Call[];
  started: number;
  elapsed?: number;
  summary?: string;
  note?: string;
  open?: boolean;
  globalOpen: boolean;
  refresh: Map<string, () => void>;
}
interface Receipt {
  ids: string[];
  summary: string;
  elapsed: number;
  note?: string;
  usage?: unknown;
}
const receiptType = "tool-overview";
const clean = (text: string) => replaceControlCharacters(stripTerminalSequences(text));

export default function toolOverview(pi: ExtensionAPI): void {
  const batches = new Map<string, Batch>();
  let current: Batch | undefined;
  let ui: ExtensionContext["ui"] | undefined;
  let timer: ReturnType<typeof setInterval> | undefined;
  let pending: AbortController | undefined;

  const stopTimer = () => {
    if (timer !== undefined) clearInterval(timer);
    timer = undefined;
  };
  const refresh = (batch: Batch) => {
    for (const invalidate of batch.refresh.values()) invalidate();
  };
  const expanded = (batch: Batch): boolean => {
    const globalOpen = ui?.getToolsExpanded() ?? false;
    if (batch.globalOpen !== globalOpen) {
      batch.globalOpen = globalOpen;
      batch.open = undefined;
    }
    return batch.open ?? globalOpen;
  };
  const add = (id: string, name: string, args: unknown): Batch => {
    const existing = batches.get(id);
    if (existing) return existing;
    current ??= {
      calls: [],
      started: Date.now(),
      globalOpen: ui?.getToolsExpanded() ?? false,
      refresh: new Map(),
    };
    current.calls.push({ id, name, args });
    batches.set(id, current);
    return current;
  };
  const finish = (
    id: string,
    result: { content: { type: string; text?: string }[] },
    failed: boolean,
    ms?: number,
  ) => {
    const batch = batches.get(id);
    const call = batch?.calls.find((item) => item.id === id);
    if (!batch || !call) return;
    call.output = result.content
      .filter((block) => block.type === "text")
      .map((block) => block.text ?? "")
      .join("\n")
      .slice(0, 2000);
    call.failed = failed;
    call.durationMs = ms;
    if (batch.calls.every((item) => item.failed !== undefined)) {
      batch.elapsed = Date.now() - batch.started;
      stopTimer();
    }
    refresh(batch);
  };

  const restore = (_event: unknown, ctx: ExtensionContext) => {
    pending?.abort();
    pending = undefined;
    stopTimer();
    current = undefined;
    batches.clear();
    ui = ctx.mode === "tui" ? ctx.ui : undefined;
    if (!ui) return;
    for (const entry of ctx.sessionManager.getBranch()) {
      if (entry.type === "message" && entry.message.role === "assistant") {
        current = undefined;
        for (const block of entry.message.content) {
          if (block.type === "toolCall") add(block.id, block.name, block.arguments);
        }
      } else if (entry.type === "message" && entry.message.role === "toolResult") {
        const message = entry.message;
        const batch = batches.get(message.toolCallId);
        if (batch) {
          const call = batch.calls.find((item) => item.id === message.toolCallId)!;
          call.failed = entry.message.isError;
          call.durationMs = entry.message.durationMs;
          batch.summary = fallback(batch.calls);
          batch.elapsed = undefined;
          batch.note = "historical timing unavailable";
        }
      } else if (entry.type === "custom" && entry.customType === receiptType) {
        const data = entry.data as Partial<Receipt> | undefined;
        if (!data || !Array.isArray(data.ids) || typeof data.summary !== "string") continue;
        const batch = batches.get(data.ids[0]);
        if (!batch) continue;
        batch.summary = clean(data.summary);
        batch.elapsed = typeof data.elapsed === "number" ? data.elapsed : undefined;
        batch.note = typeof data.note === "string" ? clean(data.note) : undefined;
      }
    }
    current = undefined;
  };
  pi.on("session_start", restore);
  pi.on("session_tree", restore);
  pi.on("session_compact", restore);
  pi.on("message_start", (event) => {
    if (event.message.role === "assistant") current = undefined;
  });
  const collect = (event: MessageUpdateEvent | MessageEndEvent) => {
    if (!ui || event.message.role !== "assistant" || !Array.isArray(event.message.content)) return;
    for (const block of event.message.content) {
      if (block.type === "toolCall") add(block.id, block.name, block.arguments);
    }
    if (current) refresh(current);
  };
  pi.on("message_update", collect);
  pi.on("message_end", collect);
  pi.on("tool_execution_start", (event) => {
    if (!ui || event.parentToolCallId) return;
    const batch = add(event.toolCallId, event.toolName, event.args);
    batch.calls.find((call) => call.id === event.toolCallId)!.args = event.args;
    if (timer === undefined) {
      timer = setInterval(() => refresh(batch), 1000);
      timer.unref();
    }
    refresh(batch);
  });
  pi.on("tool_execution_end", (event) => {
    if (!ui || event.parentToolCallId) return;
    add(event.toolCallId, event.toolName, {});
    finish(event.toolCallId, event.result, event.isError, event.durationMs);
  });

  pi.on("turn_end", async (event, ctx) => {
    if (!ui) return;
    const batch = current;
    if (!batch || batch.calls.length === 0 || batch.summary) return;
    stopTimer();
    batch.elapsed ??= Date.now() - batch.started;
    batch.summary = fallback(batch.calls);
    let usage: unknown;
    if (event.outcome === "completed" && ctx.model && !ctx.signal?.aborted) {
      batch.note = "summarizing";
      refresh(batch);
      const controller = new AbortController();
      pending = controller;
      const signal = AbortSignal.any([
        controller.signal,
        AbortSignal.timeout(20_000),
        ...(ctx.signal ? [ctx.signal] : []),
      ]);
      try {
        const source = evidence(batch.calls);
        const response = await ctx.modelRegistry
          .streamSimple(
            ctx.model,
            {
              systemPrompt: instructions,
              messages: [
                { role: "user", content: [{ type: "text", text: source }], timestamp: Date.now() },
              ],
            },
            { signal, maxTokens: 256 },
          )
          .result();
        usage = response.usage;
        const text = response.content
          .filter((block) => block.type === "text")
          .map((block) => block.text)
          .join("\n");
        const summary =
          !signal.aborted && response.stopReason !== "error" && response.stopReason !== "aborted"
            ? acceptSummary(text, source)
            : undefined;
        batch.summary = summary ? clean(summary) : fallback(batch.calls);
        batch.note = summary ? undefined : "summary unavailable";
      } catch {
        batch.note = "summary unavailable";
      } finally {
        if (pending === controller) pending = undefined;
      }
      if (controller.signal.aborted) return;
    } else {
      batch.note = event.outcome === "completed" ? "summary unavailable" : "stopped";
    }
    pi.appendEntry<Receipt>(receiptType, {
      ids: batch.calls.map((call) => call.id),
      summary: batch.summary,
      elapsed: batch.elapsed,
      note: batch.note,
      usage,
    });
    for (const call of batch.calls) call.output = undefined;
    refresh(batch);
  });

  pi.registerToolRenderer((name, next) => {
    const base = next();
    if (!ui) return base;
    // Keep each delegated slot's component separate from our wrapper component.
    const slots = new WeakMap<
      object,
      {
        call?: ReturnType<NonNullable<ToolRenderers["renderCall"]>>;
        result?: ReturnType<NonNullable<ToolRenderers["renderResult"]>>;
      }
    >();
    const stateFor = (state: object) => {
      let slotsForRow = slots.get(state);
      if (!slotsForRow) {
        slotsForRow = {};
        slots.set(state, slotsForRow);
      }
      return slotsForRow;
    };
    return {
      renderShell: "self",
      renderCall(args, theme, context) {
        const batch = batches.get(context.toolCallId);
        if (!batch) return base?.renderCall?.(args, theme, context) ?? new Text(clean(name), 0, 0);
        batch.refresh.set(context.toolCallId, context.invalidate);
        const open = expanded(batch);
        const state = stateFor(context.state);
        state.call =
          base?.renderCall?.(args, theme, {
            ...context,
            expanded: open,
            lastComponent: state.call,
          }) ?? new Text(clean(`${name} ${JSON.stringify(args)}`), 0, 0);
        const body = new Container();
        if (batch.calls[0].id === context.toolCallId) {
          const failed = batch.calls.filter((call) => call.failed).length;
          const done = batch.calls.filter((call) => call.failed !== undefined).length;
          const counts = `${batch.calls.length} call${batch.calls.length === 1 ? "" : "s"}`;
          const time =
            batch.elapsed === undefined && batch.summary
              ? ""
              : ` · ${duration(batch.elapsed ?? Date.now() - batch.started)}`;
          const label =
            batch.summary ??
            `Tools: ${[...new Set(batch.calls.map((call) => call.name))].join(", ")}`;
          const header = new Text(
            theme.fg("accent", `${open ? "⌄" : "›"} ${clean(label)}`) +
              theme.fg("muted", `  ${counts}${time}${batch.summary ? "" : ` · ${done} done`}`) +
              (failed ? theme.fg("error", ` · ${failed} failed`) : "") +
              theme.fg(
                "dim",
                `${batch.note ? ` · ${batch.note}` : ""} · ${context.keyText("app.tools.expand")}`,
              ),
            context.outputPad,
            0,
          );
          body.addChild(
            new MouseRegion(header, (event) => {
              if (event.type !== "click" || event.button !== "left") return undefined;
              batch.open = !expanded(batch);
              refresh(batch);
              return { handled: true };
            }),
          );
        }
        if (open) body.addChild(state.call);
        return body;
      },
      renderResult(result, options, theme, context) {
        const batch = batches.get(context.toolCallId);
        const open = batch ? expanded(batch) : context.expanded;
        const state = stateFor(context.state);
        // Run the native final renderer even when hidden, so its timers are cleared.
        state.result =
          base?.renderResult?.(result, { ...options, expanded: open }, theme, {
            ...context,
            expanded: open,
            lastComponent: state.result,
          }) ??
          new Text(
            clean(
              result.content
                .filter((block) => block.type === "text")
                .map((block) => block.text)
                .join("\n"),
            ),
            0,
            0,
          );
        return open || !batch ? state.result : new Container();
      },
    };
  });
  pi.on("agent_settled", () => {
    stopTimer();
    if (current && !current.summary) {
      current.elapsed ??= Date.now() - current.started;
      current.summary = fallback(current.calls);
      current.note = "stopped";
      refresh(current);
    }
  });
  pi.on("session_shutdown", () => {
    pending?.abort();
    pending = undefined;
    stopTimer();
    batches.clear();
    current = undefined;
    ui = undefined;
  });
}
