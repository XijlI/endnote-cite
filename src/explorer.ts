/**
 * EndNote library sidebar: search box, EndNote groups, and a "+" per hit that
 * drops `[@key]` into whichever note has the caret.
 *
 * Everything is rendered with Obsidian's `createEl` helpers so the same code can
 * be exercised headlessly against the stub in `test/obsidian-stub.ts`.
 */

import { Editor, ItemView, MarkdownView, Notice, WorkspaceLeaf } from "obsidian";
import type EndNoteCitePlugin from "./main";
import type { Ref } from "./types";
import { insertCitationKey } from "./insert";
import { t } from "./i18n";

export const VIEW_TYPE = "endnote-cite-explorer";

const MAX_ROWS = 200;

function authorsShort(ref: Ref): string {
  if (!ref.authors.length) return "(no author)";
  if (ref.authors.length === 1) return ref.authors[0][0];
  if (ref.authors.length === 2) return `${ref.authors[0][0]} & ${ref.authors[1][0]}`;
  return `${ref.authors[0][0]} et al.`;
}

function metaLine(ref: Ref): string {
  return [authorsShort(ref), ref.year || "n.d.", ref.journal || ref.publisher]
    .filter(Boolean)
    .join(" · ");
}

export class CiteExplorerView extends ItemView {
  private query = "";
  private groupId: number | null = null;
  private cited = new Set<string>();
  private expanded = new Set<string>();
  private searchEl: HTMLInputElement | null = null;
  private scopeEl: HTMLElement | null = null;
  private listEl: HTMLElement | null = null;
  private statusEl: HTMLElement | null = null;
  private menu: HTMLElement | null = null;
  /** Open/closed state of the floating group list (kept separately so it is testable). */
  menuOpen = false;
  private debounce: number | null = null;
  private onDocDown = (ev: MouseEvent) => {
    const target = ev.target as Node | null;
    if (this.menu?.contains(target) || this.scopeEl?.contains(target)) return;
    this.closeMenu();
  };
  private onKeyDown = (ev: KeyboardEvent) => {
    if (ev.key === "Escape") this.closeMenu();
  };

  constructor(leaf: WorkspaceLeaf, private plugin: EndNoteCitePlugin) {
    super(leaf);
  }

  getViewType(): string {
    return VIEW_TYPE;
  }

  getDisplayText(): string {
    return t("exp.title");
  }

  getIcon(): string {
    return "library";
  }

  async onOpen(): Promise<void> {
    this.renderShell();
    this.render();
    const on = (this.app.workspace as any).on;
    if (typeof on === "function") {
      this.registerEvent(
        on.call(this.app.workspace, "editor-change", () => {
          if (this.debounce) window.clearTimeout(this.debounce);
          this.debounce = window.setTimeout(() => this.syncCited(), 400);
        })
      );
      this.registerEvent(
        on.call(this.app.workspace, "active-leaf-change", () => this.syncCited())
      );
    }
  }

  async onClose(): Promise<void> {
    this.closeMenu();
    if (this.debounce) window.clearTimeout(this.debounce);
  }

  /** Redraws everything (after a library reload, style or language change). */
  refresh(): void {
    if (this.searchEl) (this.searchEl).placeholder = t("exp.search");
    this.render();
  }

  private renderShell(): void {
    const root = this.contentEl;
    root.empty();
    root.addClass("en-exp");

    const searchWrap = root.createDiv({ cls: "en-exp-search" });
    const input = searchWrap.createEl("input", {
      cls: "en-exp-input",
      attr: { type: "search", placeholder: t("exp.search") },
    }) as HTMLInputElement;
    input.addEventListener("input", () => {
      this.query = input.value;
      this.render();
    });
    input.addEventListener("keydown", (ev: KeyboardEvent) => {
      if (ev.key === "Enter") {
        const first = this.results()[0];
        if (first) this.insert(first);
      } else if (ev.key === "Escape") {
        input.value = "";
        this.query = "";
        this.render();
      }
    });
    this.searchEl = input;

    // One row: the current group + count, opens a floating list of groups.
    this.scopeEl = root.createDiv({ cls: "en-exp-scope" });
    this.scopeEl.setAttribute("aria-label", t("exp.scopeLabel"));
    this.scopeEl.addEventListener("click", (ev: MouseEvent) => {
      ev.stopPropagation();
      this.toggleMenu();
    });

    this.listEl = root.createDiv({ cls: "en-exp-list" });
    this.statusEl = root.createDiv({ cls: "en-exp-status" });
  }

  private scopeRows(): { id: number | null; name: string; count: number }[] {
    const lib = this.plugin.library;
    return [
      { id: null, name: t("exp.all"), count: lib.refs.length },
      ...lib.groups.map((g) => ({ id: g.id, name: g.name, count: g.members.length })),
    ];
  }

  private currentScope(): { id: number | null; name: string; count: number } {
    const rows = this.scopeRows();
    return rows.find((r) => r.id === this.groupId) ?? rows[0];
  }

  /** Redraws just the group row (label + count + chevron). */
  private renderScope(): void {
    if (!this.scopeEl) return;
    this.scopeEl.empty();
    const cur = this.currentScope();
    this.scopeEl.createSpan({ cls: "en-exp-scope-name", text: cur.name });
    this.scopeEl.createSpan({ cls: "en-exp-scope-count", text: String(cur.count) });
    this.scopeEl.createSpan({ cls: "en-exp-scope-chevron", text: "▾" });
  }

  private toggleMenu(): void {
    if (this.menuOpen) this.closeMenu();
    else this.openMenu();
  }

  /** Floating group list, portalled to <body> so the panel's overflow cannot clip it. */
  private openMenu(): void {
    this.closeMenu();
    this.menuOpen = true;
    if (typeof activeDocument === "undefined" || !this.scopeEl) return;

    const rect = (this.scopeEl).getBoundingClientRect();
    const menu = activeDocument.body.createDiv({ cls: "en-exp-menu" });
    for (const row of this.scopeRows()) {
      const item = menu.createDiv({ cls: "en-exp-menu-item" + (row.id === this.groupId ? " is-active" : "") });
      item.createSpan({ cls: "en-exp-menu-name", text: row.name });
      item.createSpan({ cls: "en-exp-menu-count", text: String(row.count) });
      item.addEventListener("click", (ev: MouseEvent) => {
        ev.stopPropagation();
        this.selectGroup(row.id);
      });
    }
    // Only the geometry is set from code — `position` and the look live in styles.css,
    // because the review rejects fixed CSS values written in TypeScript.
    menu.setCssProps({
      left: `${Math.round(rect.left)}px`,
      top: `${Math.round(rect.bottom + 4)}px`,
      "min-width": `${Math.round(rect.width)}px`,
    });
    // Keep the menu on screen when the panel sits near the bottom edge.
    const menuHeight = menu.offsetHeight || 260;
    const maxTop = activeWindow.innerHeight - menuHeight - 8;
    if (rect.bottom + 4 > maxTop) {
      menu.setCssProps({
        top: `${Math.max(8, Math.min(rect.top - menuHeight - 4, maxTop))}px`,
      });
    }

    this.menu = menu;
    activeDocument.addEventListener("mousedown", this.onDocDown, true);
    activeWindow.addEventListener("keydown", this.onKeyDown, true);
    activeWindow.addEventListener("resize", this.onWindowResize);
  }

  private onWindowResize = () => this.closeMenu();

  closeMenu(): void {
    this.menuOpen = false;
    if (typeof activeDocument === "undefined") return;
    activeDocument.removeEventListener("mousedown", this.onDocDown, true);
    activeWindow.removeEventListener("keydown", this.onKeyDown, true);
    activeWindow.removeEventListener("resize", this.onWindowResize);
    this.menu?.remove();
    this.menu = null;
  }

  /** Switches the active group and redraws. */
  selectGroup(groupId: number | null): void {
    this.groupId = groupId;
    this.closeMenu();
    this.render();
    this.resetScroll();
  }

  private resetScroll(): void {
    if (this.listEl) this.listEl.scrollTop = 0;
  }

  private results(): Ref[] {
    const only = this.plugin.library.groupMemberSet(this.groupId);
    return this.plugin.library.search(this.query, MAX_ROWS, only);
  }

  private render(): void {
    if (!this.listEl) return;
    const keepScroll = this.listEl.scrollTop ?? 0;
    const lib = this.plugin.library;

    if (!lib.refs.length) {
      this.renderScope();
      this.listEl.empty();
      this.listEl.createDiv({ cls: "en-empty", text: lib.error || t("exp.notLoaded") });
      this.statusEl?.setText?.(t("exp.setPath"));
      return;
    }
    this.renderScope();

    // ── list ────────────────────────────────────────────────
    this.listEl.empty();
    const hits = this.results();
    if (!hits.length) {
      this.listEl.createDiv({
        cls: "en-empty",
        text: this.query ? t("exp.noMatch") : t("exp.emptyGroup"),
      });
    }
    for (const ref of hits) {
      this.renderRow(ref);
    }

    const scope = lib.groups.find((g) => g.id === this.groupId)?.name ?? t("exp.all");
    const count = t("exp.status", { scope, n: hits.length });
    const truncated = hits.length >= MAX_ROWS ? t("exp.truncated") : "";
    this.statusEl?.setText?.(`${count}${truncated} · ${this.plugin.styleLabel()}`);
    this.listEl.scrollTop = keepScroll;
  }

  private renderRow(ref: Ref): void {
    if (!this.listEl) return;
    const isCited = this.cited.has(ref.citeKey);
    const isOpen = this.expanded.has(ref.citeKey);
    const row = this.listEl.createDiv({
      cls: "en-exp-item" + (isCited ? " is-cited" : "") + (isOpen ? " is-open" : ""),
    });
    row.setAttribute("data-key", ref.citeKey);
    row.setAttribute("role", "button");
    row.setAttribute("tabindex", "0");
    row.setAttribute("aria-expanded", String(isOpen));
    row.setAttribute(
      "aria-label",
      `${ref.title || t("exp.untitled")} — ${isOpen ? t("exp.collapse") : t("exp.expand")}`,
    );
    row.setAttribute("title", `@${ref.citeKey}`);

    row.createSpan({ cls: "en-exp-chevron", text: isOpen ? "▾" : "▸" });

    const main = row.createDiv({ cls: "en-exp-item-main" });
    main.createDiv({ cls: "en-exp-title", text: ref.title || t("exp.untitled") });
    main.createDiv({ cls: "en-exp-meta-text", text: (isCited ? "✓ " : "") + metaLine(ref) });

    const add = row.createEl("button", { cls: "en-exp-add", text: "+" });
    add.setAttribute("aria-label", t("exp.ariaInsert", { key: ref.citeKey }));
    add.setAttribute("title", t("exp.ariaInsert", { key: ref.citeKey }));
    add.addEventListener("click", (ev: MouseEvent) => {
      ev.stopPropagation();
      this.insert(ref);
    });

    // The whole row is the toggle: a narrow sidebar leaves no room for a small
    // "click the title" target, and the details panel must never squeeze it.
    row.addEventListener("click", (ev: MouseEvent) => {
      const target = (ev.target ?? null) as HTMLElement | null;
      if (target?.closest?.(".en-exp-detail")) return; // let people select text
      if (target?.closest?.(".en-exp-add")) return; // handled above
      this.toggleRow(ref.citeKey);
    });
    row.addEventListener("keydown", (ev: KeyboardEvent) => {
      if (ev.key !== "Enter" && ev.key !== " " && ev.key !== "Spacebar") return;
      ev.preventDefault?.();
      this.toggleRow(ref.citeKey, true);
    });

    if (isOpen) {
      const detail = row.createDiv({ cls: "en-exp-detail" });
      detail.createDiv({ cls: "en-exp-detail-line en-exp-detail-key", text: `@${ref.citeKey}` });
      const bits: string[] = [];
      if (ref.journal) bits.push(ref.journal);
      if (ref.volume) bits.push(`vol. ${ref.volume}`);
      if (ref.issue) bits.push(`no. ${ref.issue}`);
      if (ref.pages) bits.push(`pp. ${ref.pages}`);
      if (bits.length) detail.createDiv({ cls: "en-exp-detail-line", text: bits.join(", ") });
      if (ref.doi) detail.createDiv({ cls: "en-exp-detail-line", text: `DOI: ${ref.doi}` });
      if (ref.typeName) detail.createDiv({ cls: "en-exp-detail-line", text: ref.typeName });
      if (ref.abstract) detail.createDiv({ cls: "en-exp-abstract", text: ref.abstract });
      const copy = detail.createEl("button", { cls: "en-exp-copy", text: t("exp.copyKey") });
      copy.addEventListener("click", (ev: MouseEvent) => {
        ev.stopPropagation();
        const clip = typeof navigator !== "undefined" ? navigator.clipboard : undefined;
        void clip?.writeText(`@${ref.citeKey}`);
        new Notice(t("exp.copied", { key: ref.citeKey }));
      });
    }
  }

  /** Expands or collapses one row, keeping the list scrolled where it was. */
  private toggleRow(key: string, keepFocus = false): void {
    if (this.expanded.has(key)) this.expanded.delete(key);
    else this.expanded.add(key);
    this.render();
    if (!keepFocus) return;
    const el = this.listEl?.querySelector?.(`.en-exp-item[data-key="${key}"]`) as HTMLElement | null;
    el?.focus?.();
  }

  private insert(ref: Ref): void {
    const editor = this.targetEditor();
    if (!editor) {
      new Notice(t("exp.openNoteFirst"));
      return;
    }
    insertCitationKey(editor, ref.citeKey);
    this.cited.add(ref.citeKey);
    new Notice(t("exp.inserted", { key: ref.citeKey }));
    this.render();
  }

  /**
   * The editor to insert into. Clicking the sidebar moves focus away from the
   * note, so fall back to Obsidian's "last active editor" and then to any open
   * markdown leaf.
   */
  private targetEditor(): Editor | null {
    const ws: any = this.app.workspace;
    const active = ws.activeEditor?.editor;
    if (active) return active;
    const md = ws.getActiveViewOfType?.(MarkdownView);
    if (md?.editor) return md.editor;
    const leaves = ws.getLeavesOfType?.("markdown") ?? [];
    for (const leaf of leaves) {
      const ed = (leaf.view as MarkdownView)?.editor;
      if (ed) return ed;
    }
    return null;
  }

  /** Marks references already cited in the active note. */
  syncCited(): void {
    const text = this.targetEditor()?.getValue?.() ?? "";
    const next = new Set(this.plugin.library.keysInText(text));
    if (next.size === this.cited.size && [...next].every((k) => this.cited.has(k))) return;
    this.cited = next;
    this.render();
  }

  /** Focuses the search box (used by the command palette entry). */
  focusSearch(): void {
    this.searchEl?.focus?.();
  }
}
