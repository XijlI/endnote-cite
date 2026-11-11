import fs from "fs";
import os from "os";
import path from "path";
import { execFileSync } from "child_process";
import initSqlJs from "sql.js";
import wasmBinary from "../assets/sql-wasm.wasm";
import { readLibrary, readGroups, toCSL, parseRefTypeTable, REF_TYPE_NAMES } from "./endnote";
import type { EndNoteGroup, Ref } from "./types";
import type { CslItem } from "./csl";
import { t } from "./i18n";

/** Holds the parsed EndNote library and answers search queries. */
export class LibraryStore {
  refs: Ref[] = [];
  groups: EndNoteGroup[] = [];
  items: CslItem[] = [];
  byKey = new Map<string, Ref>();
  error = "";
  refTypeNames: string[] = REF_TYPE_NAMES;
  private SQL: any = null;
  private lastStamp = "";

  constructor(private keyOverrides: () => Record<string, string>) {}

  async ensureSql() {
    if (!this.SQL) this.SQL = await initSqlJs({ wasmBinary });
    return this.SQL;
  }

  /** Finds <Documents>/*.enl when the setting is empty. */
  static autodetect(): string {
    const docs = path.join(os.homedir(), "Documents");
    try {
      const hits = fs
        .readdirSync(docs)
        .filter((f) => f.toLowerCase().endsWith(".enl"))
        .map((f) => path.join(docs, f));
      if (hits.length) return hits[0];
    } catch {
      /* ignore */
    }
    return "";
  }

  async load(enlPath: string): Promise<boolean> {
    const file = enlPath || LibraryStore.autodetect();
    if (!file) {
      this.error = t("msg.noEnl");
      return false;
    }
    try {
      const SQL = await this.ensureSql();
      let bytes: Uint8Array;
      try {
        bytes = new Uint8Array(fs.readFileSync(file));
      } catch {
        // EndNote may hold an exclusive lock — read through a temp copy instead.
        const tmp = path.join(os.tmpdir(), `en-cite-${Date.now()}.enl`);
        fs.copyFileSync(file, tmp);
        bytes = new Uint8Array(fs.readFileSync(tmp));
        fs.unlinkSync(tmp);
      }
      this.refTypeNames = LibraryStore.readRefTypes();
      const refs = await readLibrary(SQL, bytes, this.keyOverrides(), this.refTypeNames);
      this.groups = await readGroups(SQL, bytes).catch(() => [] as EndNoteGroup[]);
      this.refs = refs.sort((a, b) => a.citeKey.localeCompare(b.citeKey));
      this.items = refs.map(toCSL);
      this.byKey = new Map(refs.map((r) => [r.citeKey, r]));
      this.error = "";
      return true;
    } catch (e: any) {
      this.error = String(e?.message || e);
      return false;
    }
  }

  private static readRefTypes(): string[] {
    try {
      const p = path.join(process.env.APPDATA || "", "EndNote", "RefTypeTable.xml");
      if (fs.existsSync(p)) {
        const names = parseRefTypeTable(fs.readFileSync(p, "utf8"));
        if (names) return names;
      }
    } catch {
      /* fall back to the built-in table */
    }
    return REF_TYPE_NAMES;
  }

  /** Reloads only when the file changed on disk. */
  async reloadIfChanged(enlPath: string): Promise<boolean> {
    try {
      const st = fs.statSync(enlPath);
      const stamp = `${st.mtimeMs}:${st.size}`;
      if (stamp === this.lastStamp) return false;
      this.lastStamp = stamp;
      return await this.load(enlPath);
    } catch {
      return false;
    }
  }

  /** Ranked fuzzy search over author, year, title, journal and key. */
  search(query: string, limit = 50, only?: Set<number> | null): Ref[] {
    const q = query.trim().toLowerCase();
    if (!q) {
      const pool = only ? this.refs.filter((r) => only.has(r.id)) : this.refs;
      return pool.slice(0, limit);
    }
    const terms = q.split(/\s+/).filter(Boolean);
    const scored: { ref: Ref; score: number }[] = [];
    for (const ref of this.refs) {
      if (only && !only.has(ref.id)) continue;
      const key = ref.citeKey.toLowerCase();
      const author = ref.authors.map((a) => a[0]).join(" ").toLowerCase();
      const title = (ref.title || "").toLowerCase();
      const journal = (ref.journal || "").toLowerCase();
      const year = ref.year;
      let score = 0;
      let all = true;
      for (const t of terms) {
        let s = 0;
        if (key === t) s = 120;
        else if (key.startsWith(t)) s = 90;
        else if (author.split(/\s+/).some((w) => w.startsWith(t))) s = 70;
        else if (author.includes(t)) s = 50;
        else if (year.startsWith(t)) s = 45;
        else if (title.includes(t)) s = 35;
        else if (journal.includes(t)) s = 20;
        if (!s) {
          all = false;
          break;
        }
        score += s;
      }
      if (!all) continue;
      if (score === 0) continue;
      scored.push({ ref, score: score - key.length * 0.1 });
    }
    scored.sort((a, b) => b.score - a.score || a.ref.citeKey.localeCompare(b.ref.citeKey));
    return scored.slice(0, limit).map((s) => s.ref);
  }

  /** Record ids of a group, or null for "no filter". */
  groupMemberSet(groupId: number | null): Set<number> | null {
    if (groupId == null) return null;
    const g = this.groups.find((x) => x.id === groupId);
    return g ? new Set(g.members) : null;
  }

  /** Citation keys referenced in a note, in first-use order. */
  keysInText(text: string): string[] {
    const out: string[] = [];
    const re = /\[[^[\]\n]*?@([A-Za-z0-9][A-Za-z0-9_-]*)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) if (!out.includes(m[1])) out.push(m[1]);
    return out;
  }
}

/** Reads the output style that EndNote currently has selected (Windows only). */
export function readEndNoteStyleName(): string {
  if (process.platform !== "win32") return "";
  const tries: [string, string][] = [
    ["HKCU\\Software\\ISI ResearchSoft\\EndNote\\Addin\\Preferences", "DefaultOutputStyle"],
    ["HKCU\\Software\\ISI ResearchSoft\\EndNote\\Preferences", "PrefsString(002)"],
  ];
  for (const [key, name] of tries) {
    try {
      const out = execFileSync("reg", ["query", key, "/v", name], {
        encoding: "utf8",
        timeout: 3000,
        windowsHide: true,
      });
      const m = new RegExp(`${name.replace(/[()]/g, "\\$&")}\\s+REG_[A-Z_]+\\s+(.+)`).exec(out);
      if (m) return m[1].trim().replace(/\.ens$/i, "");
    } catch {
      /* try the next key */
    }
  }
  return "";
}
