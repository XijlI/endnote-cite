/**
 * End-to-end harness: loads the real plugin against a stubbed Obsidian API,
 * inside a throwaway vault, and actually runs the pandoc exports.
 * Run: node test/build.mjs && node test/.build/plugin-test.cjs
 */
import fs from "fs";
import os from "os";
import path from "path";
import { TFile } from "obsidian";
import EndNoteCitePlugin from "../src/main";
import { obsidianToPandoc } from "../src/export";
import { planCitationInsert } from "../src/insert";
import { appendCsl } from "../src/editor";

(globalThis as any).window = globalThis;

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

const vaultRoot = fs.mkdtempSync(path.join(os.tmpdir(), "en-vault-"));
const noteRel = "Papers/Gut paper.md";
const noteAbs = path.join(vaultRoot, noteRel);
fs.mkdirSync(path.dirname(noteAbs), { recursive: true });

const noteBody = `---
title: Gut microbiome draft
---

# Gut microbiome and health

The gut microbiome is now considered central to host health [@deVos2022]. Earlier work
tied dietary fibre to short-chain fatty acid production [@Koh2016, pp. 1335-1336], and a
review framed the immune interaction [@Shi2017; @deVos2022].

Short note with a highlight: ==important== and an image ![[plot.png|320]].
`;
fs.writeFileSync(noteAbs, noteBody, "utf8");

const tfile = new TFile(noteRel);

/** Just enough of Obsidian's Editor for the insertion logic. */
class FakeEditor {
  lines: string[];
  cursor = { line: 0, ch: 0 };
  constructor(text: string) {
    this.lines = text.split("\n");
  }
  getValue() {
    return this.lines.join("\n");
  }
  getLine(n: number) {
    return this.lines[n] ?? "";
  }
  getCursor() {
    return { ...this.cursor };
  }
  setCursor(p: any) {
    this.cursor = { line: p.line, ch: p.ch };
  }
  replaceRange(text: string, from: any, to: any) {
    if (from.line !== to.line) throw new Error("multi-line replaceRange not supported");
    const line = this.lines[from.line] ?? "";
    this.lines[from.line] = line.slice(0, from.ch) + text + line.slice(to.ch);
  }
  replaceSelection(text: string) {
    this.replaceRange(text, this.cursor, this.cursor);
  }
  getSelection() {
    return "";
  }
}

const fakeEditor = new FakeEditor("");

const adapter = {
  getBasePath: () => vaultRoot,
  async read(rel: string) {
    return fs.readFileSync(path.join(vaultRoot, rel), "utf8");
  },
  async cachedRead(rel: string) {
    return fs.readFileSync(path.join(vaultRoot, rel), "utf8");
  },
  async write(rel: string, data: string) {
    const abs = path.join(vaultRoot, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, data, "utf8");
  },
  async writeBinary(rel: string, data: ArrayBuffer) {
    const abs = path.join(vaultRoot, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, Buffer.from(data));
  },
};

const app: any = {
  vault: {
    adapter,
    read: async (f: any) => fs.readFileSync(path.join(vaultRoot, f.path), "utf8"),
    cachedRead: async (f: any) => fs.readFileSync(path.join(vaultRoot, f.path), "utf8"),
    getAbstractFileByPath: (p: string) => (fs.existsSync(path.join(vaultRoot, p)) ? new TFile(p) : null),
  },
  metadataCache: { getFirstLinkpathDest: () => null },
  workspace: {
    updateOptions() {},
    getActiveFile: () => tfile,
    on: () => ({}),
    getActiveViewOfType: () => ({ editor: fakeEditor, file: tfile }),
    getLeavesOfType: () => [],
    revealLeaf: async () => {},
    getRightLeaf: () => null,
    getLeaf: () => null,
    rightSplit: { expand() {} },
    setActiveLeaf() {},
  },
};

function check(label: string, cond: boolean, detail = "") {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}${detail ? " — " + detail : ""}`);
  if (!cond) process.exitCode = 1;
}

async function main() {
  const plugin = new EndNoteCitePlugin(app as any, {} as any);
  await plugin.onload();

  console.log("--- 1. library ---");
  check("references loaded", plugin.library.refs.length > 100, `${plugin.library.refs.length} refs`);
  check("no library error", !plugin.library.error, plugin.library.error);
  check("cite keys unique", new Set(plugin.library.refs.map((r) => r.citeKey)).size === plugin.library.refs.length);

  console.log("--- 2. style from EndNote ---");
  const styleName = plugin.endNoteStyleName;
  check("EndNote style name read from registry", !!styleName, styleName);
  check("style matched", !!plugin.styleLabel() && plugin.styleLabel() !== "—", plugin.styleLabel());

  console.log("--- 3. search ---");
  for (const q of ["de vos", "gut", "2017", "cell"]) {
    const hits = plugin.library.search(q, 5);
    console.log(`  "${q}" -> ${hits.slice(0, 3).map((h) => h.citeKey).join(", ")}`);
  }
  check("search finds deVos2022", plugin.library.search("de vos").some((r) => r.citeKey === "deVos2022"));
  check("search finds by journal", plugin.library.search("military medical").some((r) => r.citeKey === "Shi2017"));

  console.log("--- 4. live citation rendering ---");
  const rendered = plugin.renderCitations(noteBody);
  rendered.forEach((h) => console.log("  " + h));
  check("three clusters rendered", rendered.length === 3, String(rendered.length));
  check("author-year form used", rendered[0].includes("de Vos"));

  console.log("--- 5. bibliography ---");
  const engine = (plugin as any).constructor;
  const keys = plugin.library.keysInText(noteBody);
  console.log("  cited keys:", keys.join(", "));
  check("keys extracted in order", keys[0] === "deVos2022", keys.join(","));

  console.log("--- 6. markdown conversion ---");
  const md = obsidianToPandoc(noteBody, app, noteRel);
  check("wikilink image converted", md.includes("![](") && !md.includes("![["));
  check("highlight converted", md.includes("**important**"));
  check("citations untouched", md.includes("[@deVos2022]"));

  console.log("--- 7. pandoc Word export ---");
  await plugin.exporter.exportWord(tfile);
  const docxPath = path.join(vaultRoot, "Papers", "Gut paper.docx");
  check("docx written", fs.existsSync(docxPath), docxPath);
  if (fs.existsSync(docxPath)) {
    const { execFileSync } = require("child_process");
    const txt = execFileSync("pandoc", [docxPath, "-t", "plain", "--wrap=none"], { encoding: "utf8" });
    check("citation appears in docx", /de Vos/.test(txt));
    check("bibliography present", /Gut microbiome and health: mechanistic insights/.test(txt), "");
    console.log("  ---- docx text (first 700 chars) ----");
    console.log("  " + txt.slice(0, 700).replace(/\n/g, "\n  "));
  }

  console.log("--- 8. LaTeX export ---");
  await plugin.exporter.exportLatex(tfile);
  const texPath = path.join(vaultRoot, "Papers", "Gut_paper.tex");
  const bibPath = path.join(vaultRoot, "Papers", "Gut_paper.bib");
  check("tex written (space-free name)", fs.existsSync(texPath), texPath);
  check("bib written", fs.existsSync(bibPath));
  if (fs.existsSync(texPath)) {
    const tex = fs.readFileSync(texPath, "utf8");
    check("natbib cite commands used", /\\cite[pt]?\{/.test(tex));
    check("bibliography points at sibling .bib", tex.includes("\\bibliography{Gut_paper}"));
    console.log("  " + tex.split("\n").filter((l) => /cite|bibliography\{/.test(l)).slice(0, 4).join("\n  "));
  }

  console.log("--- 9. EndNote field export (Word + EndNote automation) ---");
  await plugin.exporter.exportWordEndNote(tfile);
  const enPath = path.join(vaultRoot, "Papers", "Gut paper (EndNote).docx");
  check("EndNote docx written", fs.existsSync(enPath), enPath);
  if (fs.existsSync(enPath)) {
    const { execFileSync } = require("child_process");
    const txt = execFileSync(
      "python3",
      [
        "-c",
        [
          "import zipfile,sys",
          "x=zipfile.ZipFile(sys.argv[1]).read('word/document.xml').decode('utf8','ignore')",
          "print('CITE',x.count('ADDIN EN.CITE'))",
          "print('REFLIST',x.count('ADDIN EN.REFLIST'))",
          "print('BODYTEXT',x.count('de Vos et al.'))",
        ].join("\n"),
        enPath,
      ],
      { encoding: "utf8" }
    );
    console.log("  " + txt.trim().replace(/\n/g, "\n  "));
    check("real ADDIN EN.CITE fields present", /CITE [1-9]/.test(txt));
    check("bibliography field present", /REFLIST [1-9]/.test(txt));
    const plain = execFileSync("pandoc", [enPath, "-t", "plain", "--wrap=none"], { encoding: "utf8" });
    check("formatted citation in word text", /\(de Vos et al\., 2022\)/.test(plain), plain.slice(0, 120));
    check("bibliography rendered", /Gut microbiome and health: mechanistic insights/.test(plain));
    check("no leftover temporary citation", !/\{de Vos, 2022 #/.test(plain));
  }

  console.log("--- 10. library sidebar ---");
  const groups = plugin.library.groups;
  console.log("  groups:", groups.map((g) => `${g.name}(${g.members.length})`).join(", "));
  check("EndNote groups read from .enl", groups.length >= 3, `${groups.length} groups`);
  const y2 = groups.find((g) => g.name === "y2");
  check("group membership decoded", !!y2 && y2.members.length === 67, String(y2?.members.length));
  check(
    "group membership maps onto refs",
    !!y2 && y2.members.every((id) => plugin.library.refs.some((r) => r.id === id))
  );
  const inGroup = plugin.library.search("", 500, plugin.library.groupMemberSet(y2?.id ?? null));
  check("group filter narrows the list", inGroup.length === 67, `${inGroup.length} rows`);
  const scoped = plugin.library.search("cell", 50, plugin.library.groupMemberSet(y2?.id ?? null));
  check("search stays inside the group", scoped.every((r) => y2!.members.includes(r.id)));

  // Insertion planning (pure function used by both the sidebar and the suggester).
  const cases: [string, number, number, string, string, string][] = [
    ["plain text ", 11, 11, "deVos2022", "[@deVos2022]", "opens a new bracket"],
    ["See [@Koh2016] x", 13, 13, "deVos2022", "; @deVos2022", "appends inside a cluster"],
    ["See [@", 5, 6, "deVos2022", "@deVos2022]", "completes an open bracket"],
    ["See [@a; @k]", 9, 11, "deVos2022", "@deVos2022", "keeps the separator already typed"],
    ["See [@Koh2016] x", 14, 14, "deVos2022", "[@deVos2022]", "after a closed cluster starts a new one"],
  ];
  for (const [line, from, to, key, want, label] of cases) {
    const plan = planCitationInsert(line, from, to, key);
    const after = line.slice(0, plan.startCh) + plan.text + line.slice(plan.endCh);
    check(`plan: ${label}`, plan.text === want, `${JSON.stringify(plan.text)} -> ${JSON.stringify(after)}`);
  }

  const { CiteExplorerView, VIEW_TYPE } = require("../src/explorer");
  check("view type registered", !!(global as any).__views?.[VIEW_TYPE], VIEW_TYPE);
  const leaf = new (require("obsidian").WorkspaceLeaf)(app);
  const view: any = new CiteExplorerView(leaf, plugin);
  await view.onOpen();
  const root = view.contentEl;
  const itemRows = root.findAll("en-exp-item");
  const addButtons = root.findAll("en-exp-add");
  const scopeRow = root.find("en-exp-scope")!;
  console.log("  rendered:", itemRows.length, "rows; scope:", scopeRow?.dump());
  check("group selector is a single row", root.findAll("en-exp-scope").length === 1);
  check("group row starts on All references", (scopeRow?.dump() ?? "").includes("All references"));
  check("group row carries the total count", (scopeRow?.dump() ?? "").includes(String(plugin.library.refs.length)));
  check(
    "groups are no longer listed inline",
    root.findAll("en-exp-group").length === 0 && root.findAll("en-exp-menu").length === 0
  );
  check("sidebar lists references", itemRows.length > 50, String(itemRows.length));
  check("every row has a + button", addButtons.length === itemRows.length);
  check("row shows the reference title", root.dump().includes("Gut microbiome and health"));
  check("status line shows style", /All references · \d+/.test(root.find("en-exp-status")?.textContent ?? ""));
  scopeRow?.emit("click");
  check("clicking the group row opens the floating list", view.menuOpen);
  scopeRow?.emit("click");
  check("clicking it again closes the list", !view.menuOpen);

  // Type in the search box, then click a group, then a + button.
  const search = root.find("en-exp-input")!;
  search.value = "de vos";
  search.emit("input");
  const hits = view.contentEl.findAll("en-exp-item");
  check("search box filters", hits.length > 0 && hits.length < itemRows.length, `${hits.length} rows`);
  check("filtered row is the match", (hits[0]?.find("en-exp-title")?.textContent ?? "").includes("Gut microbiome"));

  // Expanding a row reveals the key, journal and abstract. The *whole* row is
  // the toggle — in a narrow sidebar there is no reliable "click the title"
  // target left once the details panel has taken the width.
  const row = hits[0]!;
  row.emit("click");
  const detail = view.contentEl.find("en-exp-detail");
  check("expanding a row shows its citation key", (detail?.dump() ?? "").includes("@deVos2022"));
  check("expanding a row shows journal/pages", /Gut, vol\. 71/.test(detail?.dump() ?? ""));

  const openRow = view.contentEl.findAll("en-exp-item").find((r) => r.hasClass("is-open"));
  check("open row is flagged for styling", !!openRow);
  check("open row points its chevron down", (openRow?.find("en-exp-chevron")?.textContent ?? "") === "▾");

  openRow!.emit("click");
  check("clicking the row again collapses it", view.expanded.size === 0, String(view.expanded.size));
  check("details are gone after collapsing", !view.contentEl.find("en-exp-detail"));

  // Keyboard: the row is a button, Enter toggles it.
  view.contentEl.findAll("en-exp-item")[0]!.emit("keydown", { key: "Enter", preventDefault() {} });
  check("Enter on a row expands it", view.expanded.size === 1, String(view.expanded.size));
  view.contentEl.findAll("en-exp-item")[0]!.emit("keydown", { key: "Enter", preventDefault() {} });
  check("Enter on a row collapses it again", view.expanded.size === 0, String(view.expanded.size));

  search.value = "";
  search.emit("input");
  view.selectGroup(y2!.id);
  check("choosing a group filters to it", view.contentEl.findAll("en-exp-item").length === 67);
  check("group row shows the chosen group", (view.contentEl.find("en-exp-scope")?.dump() ?? "").includes("y2"));
  check("group row shows the chosen count", (view.contentEl.find("en-exp-scope")?.dump() ?? "").includes("67"));
  check("menu is closed after choosing", !view.menuOpen);
  const scopedStatus = view.contentEl.find("en-exp-status")?.textContent ?? "";
  check("status follows the group", scopedStatus.startsWith("y2 · 67"), scopedStatus);

  fakeEditor.lines = ["The gut microbiome matters "];
  fakeEditor.cursor = { line: 0, ch: 28 };
  view.contentEl.findAll("en-exp-add")[0].emit("click");
  check(
    "clicking + inserts a citation into the note",
    /^The gut microbiome matters \[@[\w-]+\]$/.test(fakeEditor.getValue()),
    fakeEditor.getValue()
  );
  check("inserted row is marked as cited", view.contentEl.findAll("en-exp-item")[0].hasClass("is-cited"));
  view.syncCited();
  check("cited keys tracked from the note text", view.cited.size === 1, String(view.cited.size));

  // ── 11. the live ```endnote-bib``` block ────────────────────
  console.log("--- 11. live bibliography block ---");
  const { FakeEl } = await import("./obsidian-stub");
  const proc = (globalThis as any).__codeBlocks?.["endnote-bib"];
  check("endnote-bib processor is registered", typeof proc === "function");

  const blockEl: any = new FakeEl();
  proc("", blockEl, { sourcePath: noteRel });
  await wait(300);
  const header1 = blockEl.find("en-bib-header")?.dump() ?? "";
  check("block renders a bibliography list", !!blockEl.find("en-bib-list"));
  check("block header shows the title and count", /References · \d+/.test(header1), header1);

  // A library reload / style change calls invalidate(); the block must follow.
  plugin.settings.bibTitle = "Works Cited";
  plugin.refreshEditors();
  await wait(300);
  const header2 = blockEl.find("en-bib-header")?.dump() ?? "";
  check("block redraws when the library or style changes", header2.includes("Works Cited"), header2);
  check("redraw keeps the entries", !!blockEl.find("en-bib-list"));

  // Editing another note must not touch this one's block.
  plugin.settings.bibTitle = "Other note only";
  plugin.refreshBibliographyBlocks("Papers/elsewhere.md", "text [@Koh2016]");
  await wait(300);
  check(
    "blocks of other notes are left alone",
    !(blockEl.find("en-bib-header")?.dump() ?? "").includes("Other note only")
  );

  // Typing a new citation in this note redraws it with the extra entry.
  const before = (blockEl.find("en-bib-list")?.children ?? []).length;
  plugin.refreshBibliographyBlocks(noteRel, `${noteBody}\nSee also [@Ahmed2024].`);
  await wait(300);
  const after = (blockEl.find("en-bib-list")?.children ?? []).length;
  check("editing the note adds the new entry", after === before + 1, `${before} → ${after}`);
  plugin.settings.bibTitle = "References";
  await plugin.saveSettings();

  // ── 12. citation markup is built as nodes, never as HTML ────
  console.log("--- 12. citation markup ---");
  const holder: any = new FakeEl();
  appendCsl(holder, 'de Vos <i>et al.</i> &amp; Koh<sup>2</sup><script>alert(1)</script>');
  const markup = holder.dump();
  check(
    "allowed formatting tags become elements",
    holder.children.some((c: any) => c.tag === "i") && holder.children.some((c: any) => c.tag === "sup")
  );
  check("entities are decoded", markup.includes(" & ") && !markup.includes("&amp;"), markup);
  check(
    "unknown tags are dropped, their text kept",
    !markup.includes("<script") && markup.includes("alert(1)"),
    markup
  );

  console.log("\nvault root:", vaultRoot);
}

main().then(
  () => process.exit(process.exitCode ?? 0),
  (e) => {
    console.error("CRASH:", e);
    process.exit(1);
  }
);
