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
 * citeproc emits inline formatting only, but the text inside comes from the
 * user's own library. Rather than sanitising a string and handing it to
 * `innerHTML`, we walk the markup and rebuild the few tags we allow as DOM
 * nodes, so nothing else can ever be parsed as HTML.
 */
const ALLOWED_TAGS = new Set(["i", "b", "em", "strong", "sup", "sub", "span", "small"]);
const TAG_RE = /<\/?([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/g;

export function appendCsl(parent: HTMLElement, html: string): void {
  const stack: HTMLElement[] = [parent];
  const open: string[] = [];
  const text = (s: string) => {
    if (s) stack[stack.length - 1].appendChild(document.createTextNode(decodeEntities(s)));
  };
  let last = 0;
  let m: RegExpExecArray | null;
  TAG_RE.lastIndex = 0;
  while ((m = TAG_RE.exec(html))) {
    text(html.slice(last, m.index));
    last = m.index + m[0].length;
    const tag = m[1].toLowerCase();
    if (!ALLOWED_TAGS.has(tag)) continue; // unknown tag: drop the marker, keep its text
    if (m[0].startsWith("</")) {
      const at = open.lastIndexOf(tag);
      if (at >= 0) {
        open.length = at;
        stack.length = at + 1;
      }
      continue;
    }
    if (m[0].endsWith("/>")) continue;
    const child = document.createElement(tag);
    stack[stack.length - 1].appendChild(child);
    stack.push(child);
    open.push(tag);
  }
  text(html.slice(last));
}

function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_m, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_m, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&nbsp;/g, "\u00a0")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
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
    appendCsl(span, this.html);
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
