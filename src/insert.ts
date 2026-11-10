/** Shared insertion logic: turn a citation key into editor text, cluster-aware. */

import type { Editor } from "obsidian";

export interface InsertionPlan {
  text: string;
  /** Character offset in the line where the replacement starts. */
  startCh: number;
  /** Character offset where the replacement ends. */
  endCh: number;
}

/**
 * Works out what to type for `key`, given the line and the range being replaced
 * (the `@query` the user typed, or an empty range at the cursor).
 *
 * - Inside an open `[...]` -> append as `; @key` instead of opening a new bracket.
 * - If the caret already sits before a `]`, reuse that bracket instead of adding one.
 */
export function planCitationInsert(line: string, fromCh: number, toCh: number, key: string): InsertionPlan {
  // A cluster is "open" when the nearest "[" to the left has no "]" between it
  // and the caret — i.e. the caret really sits inside a bracket.
  const open = line.lastIndexOf("[", Math.max(0, fromCh));
  const between = open >= 0 ? line.slice(open + 1, fromCh) : "";
  const inCluster = open >= 0 && !between.includes("]");
  const atEnd = line[toCh] === "]";

  if (inCluster) {
    // Keep whatever separator the user already typed ("[@a; @|" -> no extra "; ").
    const sep = /;\s*$/.test(between) ? "" : /@[A-Za-z0-9]/.test(between) ? "; " : "";
    return { text: `${sep}@${key}${atEnd ? "" : "]"}`, startCh: fromCh, endCh: toCh };
  }
  return { text: `[@${key}${atEnd ? "" : "]"}`, startCh: fromCh, endCh: toCh };
}

/** Inserts `[@key]` at the caret of the given editor (appending to a cluster if inside one). */
export function insertCitationKey(editor: Editor, key: string): void {
  const cursor = editor.getCursor();
  const line = editor.getLine(cursor.line) ?? "";
  const plan = planCitationInsert(line, cursor.ch, cursor.ch, key);
  editor.replaceRange(
    plan.text,
    { line: cursor.line, ch: plan.startCh },
    { line: cursor.line, ch: plan.endCh }
  );
  editor.setCursor({ line: cursor.line, ch: plan.startCh + plan.text.length });
}
