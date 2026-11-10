/**
 * Converts citation clusters into EndNote "temporary citations".
 *
 * EndNote's own Cite While You Write scanner understands `{Author, Year #RecNum}`
 * and rewrites them into a real `ADDIN EN.CITE` field with the record attached.
 * Pages use EndNote's `@` locator syntax: `{Koh, 2016 #4@1335}`.
 */

import type { CitationCluster, Ref } from "./types";

export interface TempCitationResult {
  text: string;
  /** Citation keys that are not in the library (left untouched). */
  unknown: string[];
}

function tempForCluster(cluster: CitationCluster, byKey: Map<string, Ref>): string | null {
  const parts: string[] = [];
  for (const item of cluster.items) {
    const ref = byKey.get(item.id);
    if (!ref) return null;
    const first =
      (ref.authors[0] && ref.authors[0][0] && ref.authors[0][0].trim()) ||
      (ref.title || "").trim().slice(0, 24) ||
      "Anon";
    const year = (ref.year || "n.d.").trim();
    let piece = `${first}, ${year} #${ref.id}`;
    if (item.locator) piece += `@${item.locator}`;
    parts.push(piece);
  }
  return parts.length ? `{${parts.join("; ")}}` : null;
}

export function toTemporaryCitations(text: string, byKey: Map<string, Ref>, clusters: CitationCluster[]): TempCitationResult {
  const unknown: string[] = [];
  let out = "";
  let last = 0;
  for (const cluster of clusters) {
    out += text.slice(last, cluster.from);
    const temp = tempForCluster(cluster, byKey);
    if (temp) {
      out += temp;
    } else {
      out += cluster.raw;
      unknown.push(cluster.items.map((i) => i.id).join(", "));
    }
    last = cluster.to;
  }
  out += text.slice(last);
  return { text: out, unknown };
}

/** Braces EndNote might mistake for its own temporary citations. */
export function suspiciousBraces(text: string): string[] {
  const hits: string[] = [];
  const re = /\{[^{}\n]{0,80}\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (/[#,]\s*\d/.test(m[0]) || /\d{4}/.test(m[0])) hits.push(m[0]);
  }
  return hits;
}
