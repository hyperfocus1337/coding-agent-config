/**
 * The summary line that stands in for a collapsed tool result.
 *
 * It sits apart from `index.ts` because `index.ts` imports pi's own module, which
 * only resolves inside a pi session, and `node test/check.ts` has to run this.
 */

/** One content block of a tool result, as pi passes it to a result renderer. */
export interface Block {
  type: string;
  text?: string;
}

/** The `details` a built-in tool returns. Only the truncation flag is read here. */
export interface Details {
  truncation?: { truncated?: boolean };
}

/**
 * The line that replaces the preview, or `undefined` when pi's own renderer has to
 * run instead. An expanded row, a failed call, and a result with no text keep the
 * built-in output, so nothing is hidden: only the preview of a successful call goes.
 */
export function summary(
  content: Block[],
  options: { expanded: boolean; isPartial: boolean },
  isError: boolean,
  details: Details | undefined,
): string | undefined {
  if (options.expanded || isError) {
    return undefined;
  }
  const output = content
    .flatMap((block) => (block.type === "text" ? [block.text ?? ""] : []))
    .join("\n")
    .trim();
  if (output === "") {
    return undefined;
  }
  const lines = output.split("\n").length;
  return (
    `${lines} line${lines === 1 ? "" : "s"}` +
    (options.isPartial ? " so far" : "") +
    (details?.truncation?.truncated ? " (truncated)" : "")
  );
}
