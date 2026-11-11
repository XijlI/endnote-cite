import { MarkdownView, Notice, Plugin, TFile, Editor } from "obsidian";
import fs from "fs";
import { execFile } from "child_process";
import { EndNoteCiteSettings, DEFAULT_SETTINGS, EndNoteCiteSettingTab } from "./settings";
import { LibraryStore, readEndNoteStyleName } from "./library";
import { Exporter } from "./export";
import { CiteEngine } from "./csl";
import { findCitations } from "./citation";
import { appendCsl, citeDecorations } from "./editor";
import { CiteSuggest, CiteInsertModal } from "./suggest";
import { CiteExplorerView, VIEW_TYPE } from "./explorer";
import { STYLE_PRESETS, findPreset, matchPreset } from "./styles-registry";
import { setLanguage, resolveLanguage, t } from "./i18n";
import enUS from "../assets/locales/locales-en-US.xml";
import zhCN from "../assets/locales/locales-zh-CN.xml";
import type { Ref } from "./types";

export default class EndNoteCitePlugin extends Plugin {
  settings: EndNoteCiteSettings;
  library = new LibraryStore(() => this.settings?.keyOverrides ?? {});
  exporter: Exporter;
  endNoteStyleName = "";

  /** Rendered ```endnote-bib``` blocks, so they can be redrawn when the library,
   *  the style or the note itself changes. */
  private bibBlocks = new Set<{ el: HTMLElement; source: string; path: string }>();
  private bibRenderSeq = new WeakMap<HTMLElement, number>();
  private bibTimer: number | null = null;

  private styleXmlCache = "";
  private styleRev = 0;
  private matchedStyle: { id: string; label: string } | null = null;
  private renderCache = { sig: "", rev: -1, out: [] as string[] };
  private commandIds: string[] = [];
  private ribbonEl: HTMLElement | null = null;

  async onload() {
    await this.loadSettings();
    setLanguage(resolveLanguage(this.settings.language));
    this.exporter = new Exporter(this);
    this.addSettingTab(new EndNoteCiteSettingTab(this.app, this));

    await this.reloadLibrary(false);
    this.refreshStyle();

    // ── writing ─────────────────────────────────────────────
    this.registerEditorExtension(
      citeDecorations({
        enabled: () => this.settings.livePreview,
        render: (text) => this.renderCitations(text),
        plain: (key) => this.plainReference(key),
      })
    );
    this.registerEditorSuggest(new CiteSuggest(this));

    // ── sidebar ─────────────────────────────────────────────
    this.registerView(VIEW_TYPE, (leaf) => new CiteExplorerView(leaf, this));
    this.ribbonEl = this.addRibbonIcon("library", t("ribbon.library"), () => void this.activateExplorer());
    this.registerCommands();

    this.registerMarkdownPostProcessor(async (el, ctx) => {
      if (!this.settings.livePreview) return;
      if (!el.textContent || !el.textContent.includes("[@")) return;
      const file = this.app.vault.getAbstractFileByPath(ctx.sourcePath);
      if (!(file instanceof TFile)) return;
      const text = await this.app.vault.cachedRead(file);
      const clusters = findCitations(text);
      if (!clusters.length) return;
      const html = this.renderCitations(text);
      const map = new Map<string, string>();
      clusters.forEach((c, i) => map.set(c.raw, html[i] ?? ""));
      this.applyReadingMode(el, map);
    });

    this.registerMarkdownCodeBlockProcessor("endnote-bib", (source, el, ctx) => {
      this.bibBlocks.add({ el, source, path: ctx.sourcePath });
      void this.renderBibliographyBlock(source, el, ctx.sourcePath);
    });

    // ...and redraw them as the note is edited, so adding a `[@key]` shows up in
    // the list below without a manual refresh.
    this.registerEvent(
      this.app.workspace.on("editor-change", (editor: Editor, info: any) => {
        const path = info?.file?.path;
        if (!path) return;
        if (this.bibTimer) window.clearTimeout(this.bibTimer);
        this.bibTimer = window.setTimeout(() => {
          this.bibTimer = null;
          this.refreshBibliographyBlocks(path, editor?.getValue?.());
        }, 400);
      })
    );

    // Keep the library in sync while EndNote is open.
    this.registerInterval(
      window.setInterval(() => {
        const p = this.libraryPath();
        if (!p) return;
        void this.library.reloadIfChanged(p).then((changed) => {
          if (!changed) return;
          this.invalidate();
          new Notice(t("msg.libraryUpdated", { n: this.library.refs.length }));
        });
      }, 5000)
    );
  }

  onunload() {
    /* nothing to clean up beyond registered events */
  }

  // ── commands (re-registered when the language changes) ────

  registerCommands() {
    for (const id of this.commandIds) {
      try {
        (this.app as any).commands?.removeCommand?.(`${this.manifest.id}:${id}`);
      } catch {
        /* older API: the duplicate registration is harmless */
      }
    }
    this.commandIds = [];
    const add = (id: string, name: string, rest: Record<string, unknown>) => {
      this.commandIds.push(id);
      this.addCommand({ id, name, ...rest });
    };

    add("open-explorer", t("cmd.openExplorer"), { callback: () => void this.activateExplorer() });
    add("insert-citation", t("cmd.insertCitation"), {
      editorCallback: (editor: Editor) => this.openInsertModal(editor),
    });
    add("insert-bibliography", t("cmd.insertBibliography"), {
      editorCallback: (editor: Editor, view: MarkdownView) => this.insertBibliography(editor, view.file),
    });
    add("export-docx", t("cmd.exportDocx"), {
      checkCallback: (checking: boolean) =>
        this.fileCommand(checking, (f) => this.exporter.exportWord(f)),
    });
    add("export-docx-endnote", t("cmd.exportDocxEndNote"), {
      checkCallback: (checking: boolean) =>
        this.fileCommand(checking, (f) => this.exporter.exportWordEndNote(f)),
    });
    add("export-tex", t("cmd.exportTex"), {
      checkCallback: (checking: boolean) =>
        this.fileCommand(checking, (f) => this.exporter.exportLatex(f)),
    });
    add("export-bib", t("cmd.exportBib"), {
      checkCallback: (checking: boolean) =>
        this.fileCommand(checking, (f) => this.exporter.exportBibtex(f)),
    });
    add("export-csl-json", t("cmd.exportCslJson"), {
      checkCallback: (checking: boolean) =>
        this.fileCommand(checking, (f) => this.exporter.exportCslJson(f)),
    });
    add("reload-library", t("cmd.reloadLibrary"), {
      callback: async () => {
        await this.reloadLibrary(true);
      },
    });
  }

  /** Switches the UI language without reloading the app. */
  applyLanguage() {
    setLanguage(resolveLanguage(this.settings.language));
    this.registerCommands();
    this.ribbonEl?.setAttribute("aria-label", t("ribbon.library"));
    this.refreshExplorer();
    this.refreshBibliographyBlocks();
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE)) {
      (leaf as any).updateHeader?.();
    }
  }

  // ── settings ──────────────────────────────────────────────

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  libraryPath(): string {
    return this.settings.libraryPath || LibraryStore.autodetect();
  }

  async reloadLibrary(verbose: boolean) {
    const p = this.libraryPath();
    const ok = await this.library.load(p);
    if (verbose) {
      if (ok) new Notice(t("msg.libraryLoaded", { n: this.library.refs.length, path: p }));
      else new Notice(t("msg.libraryFailed", { error: this.library.error }));
    }
    if (ok) this.invalidate();
    if (ok) this.refreshExplorer();
    if (ok && !this.settings.libraryPath) {
      this.settings.libraryPath = p;
      await this.saveSettings();
    }
    return ok;
  }

  statusLine(): string {
    if (this.library.error) return `⚠ ${this.library.error}`;
    if (!this.library.refs.length) return t("status.none");
    return `✓ ${t("status.loaded", { n: this.library.refs.length })}`;
  }

  // ── sidebar ───────────────────────────────────────────────

  async activateExplorer(): Promise<void> {
    const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE);
    if (existing.length) {
      // `revealLeaf` is newer than our minAppVersion; expanding the split and
      // activating the leaf does the same on every supported version.
      this.app.workspace.rightSplit.expand();
      this.app.workspace.setActiveLeaf(existing[0], { focus: true });
      (existing[0].view as CiteExplorerView)?.focusSearch?.();
      return;
    }
    const leaf = this.app.workspace.getRightLeaf(false) ?? this.app.workspace.getLeaf(true);
    await leaf.setViewState({ type: VIEW_TYPE, active: true });
    this.app.workspace.rightSplit.expand();
    this.app.workspace.setActiveLeaf(leaf, { focus: true });
    (leaf.view as CiteExplorerView)?.focusSearch?.();
  }

  /** Redraws any open library sidebar (after reload / style change). */
  refreshExplorer(): void {
    const leaves = (this.app.workspace as any).getLeavesOfType?.(VIEW_TYPE) ?? [];
    for (const leaf of leaves) (leaf.view)?.refresh?.();
  }

  // ── style ─────────────────────────────────────────────────

  refreshStyle() {
    this.endNoteStyleName = this.settings.followEndNoteStyle ? readEndNoteStyleName() : "";
    this.matchedStyle = null;
    let xml = "";
    let matched = null as { id: string; label: string } | null;

    if (this.settings.followEndNoteStyle && this.endNoteStyleName) {
      const preset = matchPreset(this.endNoteStyleName);
      if (preset) {
        xml = preset.xml;
        matched = { id: preset.id, label: preset.label };
      }
    }
    if (!xml && this.settings.styleId === "custom" && this.settings.stylePath) {
      try {
        xml = fs.readFileSync(this.settings.stylePath, "utf8");
        matched = { id: "custom", label: this.settings.stylePath.split(/[\\/]/).pop() || "custom" };
      } catch {
        new Notice(t("msg.cslMissing", { path: this.settings.stylePath }));
      }
    }
    if (!xml) {
      const preset = findPreset(this.settings.styleId) || STYLE_PRESETS[0];
      xml = preset.xml;
      matched = { id: preset.id, label: preset.label };
    }
    this.styleXmlCache = xml;
    this.matchedStyle = matched;
    this.invalidate();
    this.refreshExplorer();
  }

  styleXml(): string {
    return this.styleXmlCache || STYLE_PRESETS[0].xml;
  }

  styleLabel(): string {
    return this.matchedStyle?.label ?? "—";
  }

  private localeXml(styleXml: string): string {
    // LF-normalised so the bundle does not depend on the checkout's line endings.
    return (/default-locale="zh/i.test(styleXml) ? zhCN : enUS).replace(/\r\n?/g, "\n");
  }

  private invalidate() {
    this.styleRev++;
    this.renderCache.sig = "";
    this.app.workspace.updateOptions();
    this.refreshBibliographyBlocks();
  }

  /**
   * Redraws the rendered `endnote-bib` blocks. `path` limits it to one note;
   * `noteText` is the editor's live text, used while the file on disk is still
   * a keystroke behind.
   */
  refreshBibliographyBlocks(path?: string, noteText?: string): void {
    for (const ref of [...this.bibBlocks]) {

      if (ref.el.isConnected === false) {
        this.bibBlocks.delete(ref); // the section was re-rendered or scrolled away
        continue;
      }
      if (path && ref.path !== path) continue;
      if ((ref.el as any).querySelector?.(".cm-editor")) continue; // being edited right now
      void this.renderBibliographyBlock(ref.source, ref.el, ref.path, noteText);
    }
  }

  refreshEditors() {
    this.invalidate();
  }

  // ── citation rendering ────────────────────────────────────

  /** Formatted HTML for every citation cluster in the given text. */
  renderCitations(text: string): string[] {
    const clusters = findCitations(text);
    if (!clusters.length) return [];
    const sig = clusters.map((c) => c.raw).join("\u0001");
    if (sig === this.renderCache.sig && this.renderCache.rev === this.styleRev) {
      return this.renderCache.out;
    }
    const engine = new CiteEngine({
      styleXml: this.styleXml(),
      localeXml: this.localeXml(this.styleXml()),
      items: this.library.items,
      format: "html",
    });
    const out = engine.formatClusters(clusters);
    this.renderCache = { sig, rev: this.styleRev, out };
    return out;
  }

  plainReference(key: string): string {
    const ref = this.library.byKey.get(key);
    if (!ref) return t("ref.notFound", { key });
    const authors = ref.authors.map((a) => [a[0], a[1]].filter(Boolean).join(", ")).join("; ");
    return [authors, `(${ref.year || "n.d."})`, ref.title, ref.journal].filter(Boolean).join(" ");
  }

  cslItemFor(ref: Ref) {
    return this.library.items.find((i) => i.id === ref.citeKey) ?? { id: ref.citeKey, type: "document" };
  }

  private applyReadingMode(el: HTMLElement, map: Map<string, string>) {
    const walker = activeDocument.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const nodes: Text[] = [];
    while (walker.nextNode()) nodes.push(walker.currentNode as Text);
    for (const node of nodes) {
      const value = node.nodeValue || "";
      if (!value.includes("[@")) continue;
      const re = /\[[^[\]\n]*?@[^[\]\n]*?\]/g;
      if (!re.test(value)) continue;
      const frag = createFragment();
      let last = 0;
      re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(value))) {
        if (m.index > last) frag.appendChild(activeDocument.createTextNode(value.slice(last, m.index)));
        const html = map.get(m[0]);
        if (html) {
          const span = createSpan({ cls: "en-cite" });
          appendCsl(span, html);
          frag.appendChild(span);
        } else {
          frag.appendChild(activeDocument.createTextNode(m[0]));
        }
        last = m.index + m[0].length;
      }
      if (last < value.length) frag.appendChild(activeDocument.createTextNode(value.slice(last)));
      node.parentNode?.replaceChild(frag, node);
    }
  }

  // ── commands ──────────────────────────────────────────────

  private openInsertModal(editor: Editor) {
    if (!this.library.refs.length) {
      new Notice(t("msg.loadLibraryFirst"));
      return;
    }
    new CiteInsertModal(this.app, this, (refs) => {
      const cluster = `[${refs.map((r) => `@${r.citeKey}`).join("; ")}]`;
      editor.replaceSelection(cluster);
    }).open();
  }

  private async insertBibliography(editor: Editor, file: TFile | null) {
    if (!file) return;
    const text = editor.getValue();
    const keys = this.library.keysInText(text);
    if (!keys.length) {
      new Notice(t("msg.noCitationsInNote"));
      return;
    }
    const engine = new CiteEngine({
      styleXml: this.styleXml(),
      localeXml: this.localeXml(this.styleXml()),
      items: this.library.items,
      format: "html",
    });
    const bib = engine.bibliography(keys);
    const lines = bib.entries.map((e) => `- ${e.replace(/<[^>]+>/g, "").trim()}`);
    editor.replaceSelection(`\n\n## ${this.settings.bibTitle}\n\n${lines.join("\n")}\n`);
  }

  private fileCommand(checking: boolean, fn: (f: TFile) => Promise<void>): boolean {
    const file = this.app.workspace.getActiveFile();
    if (!file || file.extension !== "md") return false;
    if (!checking) {
      fn(file).catch((e) => new Notice(t("msg.exportFailed", { error: e?.message || e }), 12000));
    }
    return true;
  }

  async checkPandoc(): Promise<string> {
    return new Promise((resolve) => {
      execFile(this.settings.pandocPath, ["--version"], { windowsHide: true }, (err: any, stdout: string) => {
        resolve(err ? "" : String(stdout).split("\n")[0]);
      });
    });
  }

  // ── bibliography block ────────────────────────────────────

  private async renderBibliographyBlock(
    source: string,
    el: HTMLElement,
    sourcePath: string,
    noteText?: string,
  ) {
    // A slower render must never overwrite a newer one: each call takes a token
    // and bails out if another render for the same block started meanwhile.
    const token = (this.bibRenderSeq.get(el) ?? 0) + 1;
    this.bibRenderSeq.set(el, token);

    const file = this.app.vault.getAbstractFileByPath(sourcePath);
    const text =
      noteText ?? (file instanceof TFile ? await this.app.vault.cachedRead(file) : "");
    if (this.bibRenderSeq.get(el) !== token) return;

    el.empty();
    if (!(file instanceof TFile)) {
      el.createDiv({ cls: "en-empty", text: t("bib.cannotRead") });
      return;
    }
    const keys = this.library.keysInText(text);

    const header = el.createDiv({ cls: "en-bib-header" });
    header.createSpan({ text: t("bib.header", { title: this.settings.bibTitle, n: keys.length }) });
    const refresh = header.createEl("button", { cls: "en-bib-refresh", text: t("bib.refresh") });
    refresh.addEventListener("click", () => {
      void this.renderBibliographyBlock(source, el, sourcePath);
    });

    if (!keys.length) {
      el.createDiv({ cls: "en-empty", text: t("bib.empty") });
      return;
    }
    const engine = new CiteEngine({
      styleXml: this.styleXml(),
      localeXml: this.localeXml(this.styleXml()),
      items: this.library.items,
      format: "html",
    });
    const bib = engine.bibliography(keys);
    const list = el.createEl("ol", { cls: "en-bib-list" });
    for (const entry of bib.entries) {
      const li = list.createEl("li");
      appendCsl(li, entry);
      if (bib.hangingIndent) li.addClass("en-hanging");
    }
    const missing = keys.filter((k) => !this.library.byKey.has(k));
    if (missing.length) {
      el.createDiv({ cls: "en-empty", text: t("bib.missing", { keys: missing.join(", ") }) });
    }
  }
}
