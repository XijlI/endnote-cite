/**
 * Thin wrapper around citeproc-js.
 *
 * The plugin renders citations twice: live inside Obsidian and, at export time,
 * inside pandoc. Both consume the same CSL style file, so what you see in the
 * editor matches what lands in the .docx.
 */

import CSL from "citeproc";
import type { CitationCluster } from "./types";

export interface CslItem {
  id: string;
  [key: string]: any;
}

export interface FormattedCitation {
  /** HTML string as produced by citeproc, e.g. "(Smith 2020)" with <i> tags. */
  html: string;
}

const NUMERIC_HINT = /citation-format\s*=\s*"numeric"|citation-format\s*=\s*"label"/;

export function styleIsNumeric(styleXml: string): boolean {
  return NUMERIC_HINT.test(styleXml);
}

export function styleTitle(styleXml: string): string {
  const m = /<title>([^<]+)<\/title>/.exec(styleXml);
  return m ? m[1] : "";
}

export class CiteEngine {
  private engine: any;
  private items: Record<string, CslItem>;
  readonly numeric: boolean;
  readonly styleTitle: string;

  constructor(opts: {
    styleXml: string;
    localeXml: string;
    lang?: string;
    items: CslItem[];
    format?: "html" | "text";
  }) {
    this.items = {};
    for (const it of opts.items) this.items[it.id] = it;
    const sys = {
      retrieveLocale: () => opts.localeXml,
      retrieveItem: (id: string) => this.items[id] ?? { id, type: "document", title: `[missing: ${id}]` },
    };
    this.engine = new (CSL as any).Engine(sys, opts.styleXml, opts.lang || "en-US");
    this.engine.setOutputFormat(opts.format || "html");
    this.numeric = styleIsNumeric(opts.styleXml);
    this.styleTitle = styleTitle(opts.styleXml);
  }

  has(id: string) {
    return !!this.items[id];
  }

  ids(): string[] {
    return Object.keys(this.items);
  }

  /** Formats clusters in document order so numeric styles get stable numbers. */
  formatClusters(clusters: CitationCluster[]): string[] {
    const order: string[] = [];
    for (const c of clusters) for (const it of c.items) if (!order.includes(it.id)) order.push(it.id);
    this.engine.updateItems(order);

    const out: string[] = [];
    const citationsPre: any[] = [];
    clusters.forEach((cluster, index) => {
      const citation: any = {
        citationID: `c${index}`,
        citationItems: cluster.items.map((it) => {
          const item: any = { id: it.id };
          if (it.prefix) item.prefix = it.prefix;
          if (it.suffix) item.suffix = it.suffix;
          if (it.locator) {
            item.locator = it.locator;
            item.label = "page";
          }
          return item;
        }),
        properties: { noteIndex: 0 },
      };
      let rendered = "";
      try {
        const res = this.engine.processCitationCluster(citation, citationsPre, []);
        const list = res?.[1] ?? [];
        const hit = list.find((entry: any[]) => entry[0] === citation.citationID) ?? list[0];
        rendered = hit ? hit[1] : "";
      } catch {
        rendered = `[cite error: ${cluster.raw}]`;
      }
      out.push(rendered);
      citationsPre.push([citation.citationID, 0]);
    });
    return out;
  }

  /** Bibliography entries (HTML) for the given ids, or every registered item. */
  bibliography(ids?: string[]): { entries: string[]; hangingIndent: boolean; lineSpacing: number; entrySpacing: number } {
    if (ids && ids.length) this.engine.updateItems(ids);
    const [meta, entries] = this.engine.makeBibliography() || [{}, []];
    return {
      entries: entries as string[],
      hangingIndent: !!meta?.hangingindent,
      lineSpacing: meta?.linespacing ?? 1,
      entrySpacing: meta?.entryspacing ?? 0,
    };
  }
}
