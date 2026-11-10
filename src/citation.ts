/** Finds pandoc-style citation clusters inside markdown text. */

import type { CitationCluster } from "./types";

const CLUSTER = /\[([^\[\]\n]*?@[^\[\]\n]*?)\]/g;

/**
 * Parses `[@a]`, `[@a; @b]`, `[@a, p. 12]`, `[-@a]`, `[see @a, ch. 2]`.
 * Only bracketed citations are recognised, so emails and @mentions stay intact.
 */
export function findCitations(text: string): CitationCluster[] {
  const out: CitationCluster[] = [];
  CLUSTER.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = CLUSTER.exec(text))) {
    const inner = m[1];
    const items: CitationCluster["items"] = [];
    // Split on semicolons (pandoc's cluster separator).
    for (const part of inner.split(";")) {
      const at = part.indexOf("@");
      if (at < 0) continue;
      const suppressAuthor = part.slice(0, at).trim().endsWith("-");
      const before = part.slice(0, at).replace(/-$/, "").trim();
      const after = part.slice(at + 1);
      const keyMatch = /^([A-Za-z0-9_:.#$%&+?<>~\/-]+)/.exec(after.trim());
      if (!keyMatch) continue;
      const id = keyMatch[1].replace(/[.,;:]$/, "");
      const rest = after.trim().slice(keyMatch[1].length).replace(/^,\s*/, "").trim();
      const item: CitationCluster["items"][number] = { id };
      if (before) item.prefix = before + " ";
      if (suppressAuthor) item.prefix = (item.prefix ?? "") + "-";
      if (rest) {
        if (/^(p|pp|page|pages|ch|chap|chapter|sec|section|para)\.?\s/i.test(rest)) {
          item.locator = rest.replace(/^[^\d]*/, "").trim();
        } else {
          item.suffix = ", " + rest;
        }
      }
      items.push(item);
    }
    if (items.length) out.push({ from: m.index, to: m.index + m[0].length, raw: m[0], items });
  }
  return out;
}

/** Rewrites citation clusters so a bare key list is spliced together. */
export function mergeAdjacent(keys: string[]): string {
  return `[${keys.map((k) => "@" + k).join("; ")}]`;
}
