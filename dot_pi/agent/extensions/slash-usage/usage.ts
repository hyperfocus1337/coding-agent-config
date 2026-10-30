/** Rank bare slash completion and retain command-only submission history. */
import * as fs from "node:fs";
import * as path from "node:path";
import type { AutocompleteProvider, EditorComponent } from "@earendil-works/pi-tui";

type Usage = Map<string, { count: number; last: number }>;

export function readUsage(file: string): Usage {
  let text: string;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return new Map();
    throw error;
  }
  const usage: Usage = new Map();
  for (const line of text.split("\n")) {
    if (!line) continue;
    let entry: unknown;
    try {
      entry = JSON.parse(line);
    } catch {
      // A partial append must not discard valid history from other sessions.
      continue;
    }
    if (!Array.isArray(entry) || entry.length !== 2) continue;
    const [name, time] = entry;
    if (
      typeof name !== "string" ||
      !/^[^\s/]+$/u.test(name) ||
      typeof time !== "number" ||
      !Number.isSafeInteger(time) ||
      time < 0
    )
      continue;
    const prior = usage.get(name);
    usage.set(name, { count: (prior?.count ?? 0) + 1, last: Math.max(prior?.last ?? 0, time) });
  }
  return usage;
}

export function recordUsage(file: string, text: string, time = Date.now()): void {
  const name = /^\s*\/([^\s/]+)(?:\s|$)/u.exec(text)?.[1];
  if (!name) return;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  // Separate records before and after each append, including after a partial write.
  // shortcut: replay a local log for each bare menu; use SQLite if history size
  // makes this slow. Append-only writes retain concurrent sessions' submissions.
  fs.appendFileSync(file, `\n${JSON.stringify([name, time])}\n`, { mode: 0o600 });
}

export function rankCommands(
  current: AutocompleteProvider,
  load: () => Usage,
): AutocompleteProvider {
  return {
    triggerCharacters: current.triggerCharacters,
    async getSuggestions(...args) {
      const result = await current.getSuggestions(...args);
      if (result?.prefix !== "/") return result;
      const usage = load();
      return {
        ...result,
        items: [...result.items].sort((a, b) => {
          const first = usage.get(a.value.replace(/^\//, ""));
          const second = usage.get(b.value.replace(/^\//, ""));
          return (
            (second?.count ?? 0) - (first?.count ?? 0) || (second?.last ?? 0) - (first?.last ?? 0)
          );
        }),
      };
    },
    applyCompletion: (...args) => current.applyCompletion(...args),
    shouldTriggerFileCompletion: (...args) =>
      current.shouldTriggerFileCompletion?.(...args) ?? true,
  };
}

/** Pi assigns onSubmit after the editor factory returns, and can assign it again. */
export function trackSubmissions(editor: EditorComponent, record: (text: string) => void): void {
  let submit = editor.onSubmit;
  const wrapped = (text: string) => {
    record(text);
    return submit?.(text);
  };
  Object.defineProperty(editor, "onSubmit", {
    configurable: true,
    get: () => wrapped,
    set: (handler: EditorComponent["onSubmit"]) => {
      submit = handler;
    },
  });
}
