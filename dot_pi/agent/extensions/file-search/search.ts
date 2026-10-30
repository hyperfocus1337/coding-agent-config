import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { AutocompleteItem, AutocompleteProvider } from "@earendil-works/pi-tui";

export function within(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  return (
    relative === "" ||
    (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative))
  );
}

/** Validate user configuration before any configured directory is searched. */
export function extraRoots(config: unknown): string[] {
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    throw new Error("Expected an object with an optional extraRoots array");
  }
  const configured = (config as { extraRoots?: unknown }).extraRoots;
  const roots = configured === undefined ? [] : configured;
  if (
    !Array.isArray(roots) ||
    roots.some(
      (root) =>
        typeof root !== "string" ||
        (!path.isAbsolute(root) && !root.startsWith("~/")) ||
        /[\r\n\0"]/.test(root),
    )
  ) {
    throw new Error(
      "extraRoots must contain absolute paths or ~/ paths without quotes or line breaks",
    );
  }
  return roots.map((root: string) =>
    root.startsWith("~/") ? path.join(os.homedir(), root.slice(2)) : root,
  );
}

export function searchRoots(
  cwd: string,
  roots: string[],
  warn: (message: string) => void,
): string[] {
  const seen = new Set([fs.realpathSync(cwd)]);
  return roots.flatMap((root) => {
    try {
      const canonical = fs.realpathSync(root);
      if (!fs.statSync(canonical).isDirectory()) throw new Error("not a directory");
      if (/[\r\n\0"]/.test(canonical)) throw new Error("unsupported path characters");
      if (seen.has(canonical)) return [];
      seen.add(canonical);
      return [canonical];
    } catch (error) {
      warn(`Cannot search ${root}: ${error instanceof Error ? error.message : String(error)}`);
      return [];
    }
  });
}

function attachmentPath(value: string): string | undefined {
  if (!value.startsWith("@")) return undefined;
  const raw = value.slice(1);
  const decoded = raw.startsWith('"') && raw.endsWith('"') ? raw.slice(1, -1) : raw;
  return /[\r\n\0"]/.test(decoded) ? undefined : decoded;
}

function unqualified(prefix: string): boolean {
  if (!prefix.startsWith("@")) return false;
  const query = prefix.slice(prefix.startsWith('@"') ? 2 : 1);
  return !/[/\\"]/.test(query) && !query.startsWith("~");
}

function absolute(base: string, value: string): string {
  return value.startsWith("~/")
    ? path.join(os.homedir(), value.slice(2))
    : path.resolve(base, value);
}

/** Keep Pi's parser, search limits, ignore rules, cancellation, and insertion. */
export function extendSearch(
  current: AutocompleteProvider,
  cwd: string,
  sources: { root: string; provider: AutocompleteProvider }[],
): AutocompleteProvider {
  return {
    triggerCharacters: current.triggerCharacters,
    shouldTriggerFileCompletion: current.shouldTriggerFileCompletion?.bind(current),
    applyCompletion: current.applyCompletion.bind(current),
    async getSuggestions(lines, cursorLine, cursorCol, options) {
      const local = await current.getSuggestions(lines, cursorLine, cursorCol, options);
      if (
        options.signal.aborted ||
        !sources.length ||
        !(lines[cursorLine] ?? "").slice(0, cursorCol).includes("@") ||
        (local && !unqualified(local.prefix))
      )
        return local;

      const results = await Promise.all(
        sources.map(async ({ root, provider }) => {
          try {
            return {
              root,
              result: await provider.getSuggestions(lines, cursorLine, cursorCol, options),
            };
          } catch {
            return { root, result: null };
          }
        }),
      );
      if (options.signal.aborted) return null;
      const prefix =
        local?.prefix ??
        results.find(({ result }) => result && unqualified(result.prefix))?.result?.prefix;
      if (!prefix || !unqualified(prefix)) return local;

      const candidates: { item: AutocompleteItem; target: string; local: boolean }[] = [];
      const seen = new Set<string>();
      const add = (item: AutocompleteItem, base: string, isLocal: boolean) => {
        const raw = attachmentPath(item.value);
        if (raw === undefined) return;
        try {
          const target = fs.realpathSync(absolute(base, raw));
          // Additional roots must not expose targets outside them through symlinks.
          if ((!isLocal && !within(base, target)) || seen.has(target)) return;
          seen.add(target);
          if (!isLocal) {
            const home = os.homedir();
            const display = within(base, cwd)
              ? path.relative(cwd, target) || "."
              : within(home, target)
                ? `~/${path.relative(home, target)}`
                : target;
            const directory = item.label.endsWith("/");
            const insertion = display + (directory ? "/" : "");
            // Rebasing can add spaces or punctuation absent from the native result.
            const quoted =
              item.value.startsWith('@"') ||
              prefix.startsWith('@"') ||
              /[^A-Za-z0-9/_.~:@+-]/u.test(insertion);
            item = {
              ...item,
              value: quoted ? `@"${insertion}"` : `@${insertion}`,
              description: display,
            };
          }
          candidates.push({ item, target, local: isLocal });
        } catch {
          // A file can disappear while the completion search runs.
        }
      };
      for (const item of local?.items ?? []) add(item, cwd, true);
      for (const { root, result } of results) {
        if (result?.prefix === prefix) for (const item of result.items) add(item, root, false);
      }
      const query = prefix.slice(prefix.startsWith('@"') ? 2 : 1).toLowerCase();
      const score = (item: AutocompleteItem) => {
        const name = item.label.replace(/\/$/, "").toLowerCase();
        return name === query ? 3 : name.startsWith(query) ? 2 : name.includes(query) ? 1 : 0;
      };
      candidates.sort(
        (a, b) =>
          score(b.item) - score(a.item) ||
          Number(b.local) - Number(a.local) ||
          path.relative(cwd, a.target).split(path.sep).length -
            path.relative(cwd, b.target).split(path.sep).length ||
          a.target.localeCompare(b.target),
      );
      return candidates.length
        ? { prefix, items: candidates.slice(0, 20).map(({ item }) => item) }
        : local;
    },
  };
}
