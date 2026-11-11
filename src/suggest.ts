/** `[@` autocomplete plus a search dialog for inserting citations. */

import { App, Editor, EditorPosition, EditorSuggest, EditorSuggestContext, EditorSuggestTriggerInfo, Modal, TFile } from "obsidian";
import type EndNoteCitePlugin from "./main";
import type { Ref } from "./types";
import { planCitationInsert } from "./insert";
import { t } from "./i18n";

function describe(ref: Ref): string {
  const authors =
    ref.authors.length > 1
      ? `${ref.authors[0][0]} et al.`
      : ref.authors.length
      ? ref.authors[0][0]
      : "(no author)";
  return `${authors} ${ref.year || "n.d."}`;
}

function secondary(ref: Ref): string {
  return [ref.title, ref.journal, ref.pages].filter(Boolean).join(" · ").slice(0, 160);
}

/** ": [@smi" in the editor triggers a reference list filtered by "smi". */
export class CiteSuggest extends EditorSuggest<Ref> {
  constructor(private plugin: EndNoteCitePlugin) {
    super(plugin.app);
  }

  onTrigger(cursor: EditorPosition, editor: Editor, _file: TFile): EditorSuggestTriggerInfo | null {
    const line = editor.getLine(cursor.line).slice(0, cursor.ch);
    // Find the citation cluster the cursor sits in, if any.
    const open = line.lastIndexOf("[");
    const closed = line.lastIndexOf("]");
    const inCluster = open >= 0 && open > closed;
    const scope = inCluster ? line.slice(open + 1) : line;
    const m = /@([A-Za-z0-9_-]*)$/.exec(scope);
    if (!m) return null;
    const start: EditorPosition = { line: cursor.line, ch: cursor.ch - m[0].length };
    return { start, end: cursor, query: m[1] };
  }

  getSuggestions(context: EditorSuggestContext): Ref[] {
    return this.plugin.library.search(context.query, 40);
  }

  renderSuggestion(ref: Ref, el: HTMLElement): void {
    el.addClass("en-suggest-item");
    const top = el.createDiv({ cls: "en-suggest-top" });
    top.createSpan({ cls: "en-suggest-key", text: `@${ref.citeKey}` });
    top.createSpan({ cls: "en-suggest-when", text: describe(ref) });
    el.createDiv({ cls: "en-suggest-title", text: ref.title || secondary(ref) });
    const sub = secondary(ref);
    if (sub) el.createDiv({ cls: "en-suggest-sub", text: sub });
  }

  selectSuggestion(ref: Ref, _evt: MouseEvent | KeyboardEvent): void {
    const ctx = this.context;
    if (!ctx) return;
    const editor = ctx.editor;
    const line = editor.getLine(ctx.start.line);
    const plan = planCitationInsert(line, ctx.start.ch, ctx.end.ch, ref.citeKey);
    editor.replaceRange(
      plan.text,
      { line: ctx.start.line, ch: plan.startCh },
      { line: ctx.end.line, ch: plan.endCh }
    );
    editor.setCursor({ line: ctx.start.line, ch: plan.startCh + plan.text.length });
  }
}

/** Search dialog: multi-select references, then insert one bracketed cluster. */
export class CiteInsertModal extends Modal {
  private query = "";
  private results: Ref[] = [];
  private active = 0;
  private chosen: Ref[] = [];
  private inputEl: HTMLInputElement;
  private listEl: HTMLElement;
  private chipsEl: HTMLElement;

  constructor(
    app: App,
    private plugin: EndNoteCitePlugin,
    private onSubmit: (refs: Ref[]) => void
  ) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.addClass("en-modal");
    contentEl.createEl("h3", { text: t("insert.title") });

    this.inputEl = contentEl.createEl("input", {
      cls: "en-modal-input",
      attr: { placeholder: t("insert.placeholder"), type: "text" },
    });
    this.inputEl.addEventListener("input", () => {
      this.query = this.inputEl.value;
      this.active = 0;
      this.refresh();
    });
    this.inputEl.addEventListener("keydown", (ev) => this.onKey(ev));

    this.chipsEl = contentEl.createDiv({ cls: "en-chips" });
    this.listEl = contentEl.createDiv({ cls: "en-modal-list" });

    this.refresh();
    window.setTimeout(() => this.inputEl.focus(), 30);
  }

  private onKey(ev: KeyboardEvent): void {
    if (ev.key === "ArrowDown") {
      this.active = Math.min(this.active + 1, this.results.length - 1);
      this.refresh();
      ev.preventDefault();
    } else if (ev.key === "ArrowUp") {
      this.active = Math.max(this.active - 1, 0);
      this.refresh();
      ev.preventDefault();
    } else if (ev.key === "Enter") {
      const hit = this.results[this.active];
      if (!hit) return;
      if (ev.shiftKey) {
        this.chosen.push(hit);
        this.query = "";
        this.inputEl.value = "";
        this.refresh();
      } else {
        this.finish(this.chosen.length ? this.chosen : [hit]);
      }
      ev.preventDefault();
    } else if (ev.key === "Escape") {
      this.close();
    }
  }

  private finish(refs: Ref[]): void {
    this.onSubmit(refs);
    this.close();
  }

  private refresh(): void {
    this.results = this.plugin.library.search(this.query, 60);
    this.listEl.empty();
    this.chipsEl.empty();

    for (const ref of this.chosen) {
      const chip = this.chipsEl.createSpan({ cls: "en-chip", text: `@${ref.citeKey}` });
      chip.addEventListener("click", () => {
        this.chosen = this.chosen.filter((r) => r !== ref);
        this.refresh();
      });
    }

    if (!this.results.length) {
      this.listEl.createDiv({ cls: "en-empty", text: t("insert.empty") });
      return;
    }
    this.results.forEach((ref, i) => {
      const row = this.listEl.createDiv({ cls: "en-row" + (i === this.active ? " is-active" : "") });
      row.createSpan({ cls: "en-suggest-key", text: `@${ref.citeKey}` });
      row.createSpan({ cls: "en-suggest-when", text: describe(ref) });
      row.createDiv({ cls: "en-suggest-title", text: ref.title || "" });
      row.createDiv({ cls: "en-suggest-sub", text: secondary(ref) });
      row.addEventListener("mousemove", () => {
        if (this.active !== i) {
          this.active = i;
          this.refresh();
        }
      });
      row.addEventListener("click", (ev) => {
        if (ev.shiftKey) {
          this.chosen.push(ref);
          this.refresh();
        } else this.finish(this.chosen.length ? [...this.chosen, ref] : [ref]);
      });
    });
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
