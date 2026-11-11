/**
 * Export pipeline: Obsidian markdown -> pandoc -> .docx / .tex / .bib / .json.
 *
 * pandoc does the heavy lifting (styling, references, numbering) using the same
 * CSL file the editor previews with, so the exported document matches what you
 * saw while writing.
 */

import { App, Notice, TFile, normalizePath, FileSystemAdapter } from "obsidian";
import { execFile } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import type EndNoteCitePlugin from "./main";
import type { Ref } from "./types";
import { findCitations } from "./citation";
import { toTemporaryCitations, suspiciousBraces } from "./endnote-fields";
import { formatWithEndNote, bridgeScriptPath } from "./bridge";
import { t } from "./i18n";

function run(cmd: string, args: string[], cwd: string): Promise<{ code: number; out: string; err: string }> {
  return new Promise((resolve) => {
    execFile(cmd, args, { cwd, windowsHide: true, maxBuffer: 32 * 1024 * 1024 }, (err, stdout, stderr) => {
      resolve({ code: err ? (err as any).code ?? 1 : 0, out: stdout ?? "", err: stderr ?? String(err ?? "") });
    });
  });
}

/** BibTeX rendering for the LaTeX export. */
export function toBibtex(ref: Ref): string {
  const type =
    ref.cslType === "article-journal"
      ? "article"
      : ref.cslType === "chapter"
      ? "incollection"
      : ref.cslType === "paper-conference"
      ? "inproceedings"
      : ref.cslType === "book"
      ? "book"
      : "misc";
  const esc = (s: string) =>
    (s || "")
      .replace(/([&%$#_])/g, "\\$1")
      .replace(/\u2013|\u2014/g, "--")
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/[\u201c\u201d]/g, "``");
  const authors = ref.authors
    .map(([family, given]) => (given ? `${esc(family)}, ${esc(given)}` : esc(family)))
    .join(" and ");
  const fields: [string, string][] = [
    ["author", authors],
    ["title", `{${esc(ref.title)}}`],
    ["journal", ref.cslType === "article-journal" ? esc(ref.journal) : ""],
    ["booktitle", ref.cslType === "chapter" || ref.cslType === "paper-conference" ? esc(ref.journal) : ""],
    ["year", ref.year],
    ["volume", ref.volume],
    ["number", ref.issue],
    ["pages", ref.pages.replace(/[-–]/g, "--")],
    ["publisher", esc(ref.publisher)],
    ["address", esc(ref.place)],
    ["edition", esc(ref.edition)],
    ["doi", ref.doi],
    ["url", ref.url],
    ["isbn", ref.isbn.split("\n")[0]],
  ];
  const body = fields
    .filter(([, v]) => v)
    .map(([k, v]) => `  ${k} = {${v}}`)
    .join(",\n");
  return `@${type}{${ref.citeKey},\n${body}\n}\n`;
}

/** Converts the Obsidian-only bits of a note into portable markdown. */
export function obsidianToPandoc(md: string, app: App, sourcePath: string): string {
  let text = md;

  // Our own bibliography placeholder block: pandoc generates the real list.
  text = text.replace(/^```endnote-bib[^\n]*\n[\s\S]*?^```\s*$/gm, "");

  // %%comments%%
  text = text.replace(/%%[\s\S]*?%%/g, "");

  // ![[image.png|300]] -> ![](absolute/path.png){width=300px}
  text = text.replace(/!\[\[([^\]|]+)(?:\|(\d+))?\]\]/g, (_m, link: string, width?: string) => {
    const target = app.metadataCache.getFirstLinkpathDest(link, sourcePath);
    if (!target) return `![](${link.replace(/ /g, "%20")})`;
    const adapter = app.vault.adapter as FileSystemAdapter;
    const abs = adapter.getFullPath(target.path).replace(/\\/g, "/");
    return `![](${abs})${width ? `{width=${width}px}` : ""}`;
  });

  // [[note|alias]] / [[note]]
  text = text.replace(/\[\[([^\]|#]+)(?:\|([^\]]+))?\]\]/g, (_m, note: string, alias?: string) => alias || note);

  // Obsidian highlight -> bold (pandoc's markdown has no ==...==)
  text = text.replace(/==([^=\n]+)==/g, "**$1**");

  // Callouts: "> [!note] Title" -> "> **Title**"
  text = text.replace(/^>\s*\[!([a-zA-Z]+)\][+-]?\s*(.*)$/gm, (_m, _kind, title: string) =>
    title ? `> **${title}**` : ">"
  );

  return text;
}

export class Exporter {
  constructor(private plugin: EndNoteCitePlugin) {}

  private vaultRoot(): string {
    return (this.plugin.app.vault.adapter as FileSystemAdapter).getBasePath();
  }

  /** Absolute output path for the given note and extension. */
  private targetPath(file: TFile, ext: string, suffix = ""): string {
    const root = this.vaultRoot();
    const folderSetting = this.plugin.settings.exportFolder.trim();
    const vaultFolder = folderSetting
      ? normalizePath(folderSetting)
      : file.parent && file.parent.path !== "/"
      ? file.parent.path
      : "";
    const dir = vaultFolder ? path.join(root, vaultFolder) : root;
    fs.mkdirSync(dir, { recursive: true });
    // LaTeX toolchains choke on spaces in \bibliography{...}, so tex/bib names
    // are slugged; Word files keep the note's name as-is.
    const base = ext === "docx" ? file.basename : file.basename.replace(/[^\w.-]+/g, "_");
    return path.join(dir, `${base}${suffix}.${ext}`);
  }

  /** Folder the plugin itself lives in (needed to find the PowerShell bridge). */
  private pluginDir(): string {
    const manifest: any = this.plugin.manifest;
    if (manifest?.dir && path.isAbsolute(manifest.dir)) return manifest.dir;
    return path.join(this.vaultRoot(), this.plugin.app.vault.configDir, "plugins", manifest?.id ?? "endnote-cite");
  }

  private async prepare(file: TFile): Promise<{ dir: string; mdPath: string }> {
    const raw = await this.plugin.app.vault.read(file);
    const md = obsidianToPandoc(raw, this.plugin.app, file.path);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "en-cite-"));
    const mdPath = path.join(dir, "note.md");
    fs.writeFileSync(mdPath, md, "utf8");

    // Bibliography data + CSL style next to the note.
    const refs = this.plugin.library.refs;
    fs.writeFileSync(path.join(dir, "refs.json"), JSON.stringify(refs.map((r) => this.plugin.cslItemFor(r)), null, 1), "utf8");
    fs.writeFileSync(path.join(dir, "refs.bib"), refs.map(toBibtex).join("\n"), "utf8");
    fs.writeFileSync(path.join(dir, "style.csl"), this.plugin.styleXml(), "utf8");
    return { dir, mdPath };
  }

  async exportWord(file: TFile): Promise<void> {
    const { dir, mdPath } = await this.prepare(file);
    const outDocx = path.join(dir, "out.docx");
    const args = [
      mdPath,
      "-o",
      outDocx,
      "--citeproc",
      `--bibliography=${path.join(dir, "refs.json")}`,
      `--csl=${path.join(dir, "style.csl")}`,
      `--resource-path=${this.vaultRoot()}`,
      "--from=markdown+pipe_tables+footnotes+tex_math_dollars",
    ];
    const tpl = this.plugin.settings.wordTemplate.trim();
    if (tpl && fs.existsSync(tpl)) args.push(`--reference-doc=${tpl}`);

    const res = await run(this.plugin.settings.pandocPath, args, dir);
    if (res.code !== 0 || !fs.existsSync(outDocx)) {
      throw new Error(t("export.pandocFailed", { error: String(res.err || res.out).trim() }));
    }
    const dest = this.targetPath(file, "docx");
    const bytes = fs.readFileSync(outDocx);
    await this.plugin.app.vault.adapter.writeBinary(
      dest.slice(this.vaultRoot().length + 1).replace(/\\/g, "/"),
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
    );
    notify(t("export.docxDone", { path: dest }));
  }

  /**
   * Word export that EndNote can keep managing: citations become EndNote
   * temporary citations, then Word + EndNote rewrite them into real
   * `ADDIN EN.CITE` fields and generate the bibliography themselves.
   */
  async exportWordEndNote(file: TFile): Promise<void> {
    const raw = await this.plugin.app.vault.read(file);
    const md = obsidianToPandoc(raw, this.plugin.app, file.path);
    const clusters = findCitations(md);
    if (!clusters.length) {
      throw new Error(t("export.noCitations"));
    }
    const { text, unknown } = toTemporaryCitations(md, this.plugin.library.byKey, clusters);
    if (unknown.length) {
      new Notice(t("export.unknownKeys", { keys: unknown.join("; ").slice(0, 200) }), 10000);
    }

    const braces = suspiciousBraces(text);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "en-cite-endnote-"));
    const mdPath = path.join(dir, "note.md");
    // EndNote appends its bibliography at the very end, so a heading has to be the
    // last thing in the body — but never duplicate one the note already ends with.
    const trimmed = text.trimEnd();
    const tail = trimmed.split("\n").filter((l) => l.trim()).slice(-2).join("\n");
    const hasHeading = /(^|\n)\s*#{1,6}\s*(参考文献|引用文献|references?|bibliography|works cited|literature cited)\s*$/i.test(tail);
    const body = hasHeading ? `${trimmed}\n` : `${trimmed}\n\n## ${this.plugin.settings.bibTitle}\n`;
    fs.writeFileSync(mdPath, body, "utf8");

    const inDocx = path.join(dir, "in.docx");
    const outDocx = path.join(dir, "out.docx");
    const res = await run(
      this.plugin.settings.pandocPath,
      [mdPath, "-o", inDocx, "--from=markdown+pipe_tables+footnotes+tex_math_dollars"],
      dir
    );
    if (res.code !== 0 || !fs.existsSync(inDocx)) {
      throw new Error(t("export.pandocFailed", { error: String(res.err || res.out).trim() }));
    }

    new Notice(t("export.endnoteWorking"), 6000);
    const bridge = await formatWithEndNote({
      scriptPath: bridgeScriptPath(this.pluginDir()),
      input: inDocx,
      output: outDocx,
      libraryPath: this.plugin.libraryPath(),
      endNoteExe: this.plugin.settings.endNoteExe || undefined,
      timeoutSeconds: 60,
    });

    if (!bridge.ok || !fs.existsSync(outDocx)) {
      const hint = braces.length
        ? t("export.endnoteBraces", { braces: braces.slice(0, 3).join(" ") })
        : "";
      throw new Error(`${bridge.message}${hint}`);
    }

    const dest = this.targetPath(file, "docx", " (EndNote)");
    const bytes = fs.readFileSync(outDocx);
    await this.plugin.app.vault.adapter.writeBinary(
      dest.slice(this.vaultRoot().length + 1).replace(/\\/g, "/"),
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
    );
    notify(t("export.endnoteDone", { n: bridge.fields, path: dest }));
  }

  async exportLatex(file: TFile): Promise<void> {
    const { dir, mdPath } = await this.prepare(file);
    const outTex = path.join(dir, "out.tex");
    const args = [
      mdPath,
      "-o",
      outTex,
      "-s",
      "--natbib",
      `--bibliography=${path.join(dir, "refs.bib")}`,
      `--resource-path=${this.vaultRoot()}`,
      "--from=markdown+pipe_tables+footnotes+tex_math_dollars",
    ];
    const res = await run(this.plugin.settings.pandocPath, args, dir);
    if (res.code !== 0 || !fs.existsSync(outTex)) {
      throw new Error(t("export.pandocFailed", { error: String(res.err || res.out).trim() }));
    }
    const latex = fs.readFileSync(outTex, "utf8");
    const destTex = this.targetPath(file, "tex");
    const destBib = this.targetPath(file, "bib");
    const rel = path.basename(destBib);
    const fixed = latex
      .replace(/\\bibliography\{[^}]*\}/g, `\\bibliography{${rel.replace(/\.bib$/, "")}}`)
      .replace(/\\bibliographystyle\{[^}]*\}/g, "\\bibliographystyle{plainnat}");
    await this.plugin.app.vault.adapter.write(destTex.slice(this.vaultRoot().length + 1).replace(/\\/g, "/"), fixed);
    await this.plugin.app.vault.adapter.write(destBib.slice(this.vaultRoot().length + 1).replace(/\\/g, "/"), fs.readFileSync(path.join(dir, "refs.bib"), "utf8"));
    notify(t("export.texDone", { tex: destTex, bib: path.basename(destBib) }));
  }

  async exportBibtex(file: TFile): Promise<void> {
    const dest = this.targetPath(file, "bib");
    const body = this.plugin.library.refs.map(toBibtex).join("\n");
    await this.plugin.app.vault.adapter.write(dest.slice(this.vaultRoot().length + 1).replace(/\\/g, "/"), body);
    notify(t("export.bibDone", { path: dest }));
  }

  async exportCslJson(file: TFile): Promise<void> {
    const dest = this.targetPath(file, "json");
    const body = JSON.stringify(this.plugin.library.refs.map((r) => this.plugin.cslItemFor(r)), null, 1);
    await this.plugin.app.vault.adapter.write(dest.slice(this.vaultRoot().length + 1).replace(/\\/g, "/"), body);
    notify(t("export.cslDone", { path: dest }));
  }
}

function notify(msg: string) {
  new Notice(msg, 8000);
}
