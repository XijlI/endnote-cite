/** CodeMirror 6 extension that shows citations as formatted text in Live Preview. */

import { EditorView, Decoration, WidgetType } from "@codemirror/view";
import { EditorState, RangeSetBuilder } from "@codemirror/state";
import { findCitations } from "./citation";

export interface CiteRenderer {
  /** Formatted HTML per cluster, in document order. */
  render(docText: string): string[];
  /** Plain-text preview used for the tooltip. */
  plain(key: string): string;
  enabled(): boolean;
}

/**
 * citeproc only ever emits inline formatting tags, but the text inside them comes
 * from the user's own library, so strip anything that is not a known formatting
 * tag before handing it to innerHTML.
 */
export function sanitizeCslHtml(html: string): string {
  return html
    .replace(/<(?!\/?(?:i|b|em|strong|sup|sub|span|small|sc)\b)[^>]*>/gi, "")
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");
}

class CiteWidget extends WidgetType {
  constructor(readonly html: string, readonly tooltip: string) {
    super();
  }
  eq(other: CiteWidget) {
    return other.html === this.html && other.tooltip === this.tooltip;
  }
  toDOM() {
    const span = document.createElement("span");
    span.className = "en-cite";
    span.innerHTML = sanitizeCslHtml(this.html);
    if (this.tooltip) span.setAttribute("aria-label", this.tooltip);
    span.title = this.tooltip;
    return span;
  }
  ignoreEvent() {
    return false; // let clicks move the cursor into the citation
  }
}

/** Offsets that sit inside fenced or inline code, where markers stay literal. */
function codeRanges(text: string): [number, number][] {
  const ranges: [number, number][] = [];
  const fence = /^```[\s\S]*?^```/gm;
  let m: RegExpExecArray | null;
  while ((m = fence.exec(text))) ranges.push([m.index, m.index + m[0].length]);
  const tick = /`[^`\n]+`/g;
  while ((m = tick.exec(text))) ranges.push([m.index, m.index + m[0].length]);
  return ranges;
}

function inside(pos: number, ranges: [number, number][]) {
  return ranges.some(([a, b]) => pos >= a && pos <= b);
}

function selectionTouches(state: EditorState, from: number, to: number): boolean {
  for (const r of state.selection.ranges) {
    if (r.from <= to && r.to >= from) return true;
  }
  return false;
}

export function citeDecorations(renderer: CiteRenderer) {
  return EditorView.decorations.compute(["doc", "selection"], (state) => {
    if (!renderer.enabled()) return Decoration.none;
    const text = state.doc.toString();
    if (!text.includes("[@")) return Decoration.none;
    const clusters = findCitations(text);
    if (!clusters.length) return Decoration.none;

    let html: string[];
    try {
      html = renderer.render(text);
    } catch (e) {
      return Decoration.none;
    }
    const codes = codeRanges(text);
    const builder = new RangeSetBuilder<Decoration>();
    clusters.forEach((c, i) => {
      if (!html[i]) return;
      if (inside(c.from, codes) || selectionTouches(state, c.from, c.to)) return;
      const tip = c.items.map((it) => renderer.plain(it.id)).join("\n");
      builder.add(c.from, c.to, Decoration.replace({ widget: new CiteWidget(html[i], tip) }));
    });
    return builder.finish();
  });
}

/** Marks citations that reference a key missing from the library. */
export function markUnknown(html: string): string {
  return html.replace(/\[missing: ([^\]]+)\]/g, '<span class="en-cite-missing">missing: $1</span>');
}
