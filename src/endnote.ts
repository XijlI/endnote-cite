/**
 * EndNote library reader.
 *
 * Every modern EndNote library (.enl) is a plain SQLite database, so we can read
 * the reference list directly — no RIS/XML export step, and EndNote keeps writing
 * to the file while we read a copy of it.
 *
 * The column names in the `refs` table are EndNote's internal field names; the
 * mapping to CSL-JSON lives in `toCSL()` below.
 */

import initSqlJs, { SqlJsStatic } from "sql.js";
import type { EndNoteGroup, Ref } from "./types";
import { t } from "./i18n";

/**
 * Fallback reference-type names, in EndNote 2025 order. At runtime we prefer the
 * live table from %APPDATA%\EndNote\RefTypeTable.xml, which also carries custom
 * types created by the user.
 */
export const REF_TYPE_NAMES = [
  "Journal Article",
  "Book",
  "Thesis",
  "Conference Proceedings",
  "Personal Communication",
  "Newspaper Article",
  "Computer Program",
  "Book Section",
  "Magazine Article",
  "Edited Book",
  "Report",
  "Map",
  "Audiovisual Material",
  "Artwork",
  "Unused 1",
  "Patent",
  "Web Page",
  "Bill",
  "Case",
  "Hearing",
  "Manuscript",
  "Film or Broadcast",
  "Statute",
  "Unused 2",
  "Unused 3",
  "Figure",
  "Chart or Table",
  "Equation",
  "Electronic Article",
  "Electronic Book",
  "Online Database",
  "Generic",
  "Government Document",
  "Conference Paper",
  "Online Multimedia",
  "Classical Work",
  "Legal Rule or Regulation",
  "Unpublished Work",
  "Unused 4",
  "Unused 5",
  "Unused 6",
  "Unused 7",
  "Aggregated Database",
  "Blog",
  "Catalog",
  "Pamphlet",
  "Serial",
  "Standard",
  "Dataset",
  "Electronic Book Section",
  "Music",
  "Podcast",
  "Press Release",
  "Interview",
  "Discussion Forum",
  "Social Media",
  "Television Episode",
  "Multimedia Application",
];

/** Reads EndNote's own reference-type table (id -> name) when available. */
export function parseRefTypeTable(xml: string): string[] | null {
  const names: string[] = [];
  const re = /<RefType\s+id="(\d+)"\s+name="([^"]*)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) names[Number(m[1])] = m[2];
  return names.length ? names : null;
}

const CSL_TYPE_BY_EN_TYPE: Record<string, string> = {
  "Journal Article": "article-journal",
  "Electronic Article": "article-journal",
  "Conference Paper": "paper-conference",
  "Conference Proceedings": "paper-conference",
  Book: "book",
  "Electronic Book": "book",
  "Edited Book": "book",
  "Book Section": "chapter",
  "Electronic Book Section": "chapter",
  "Magazine Article": "article-magazine",
  "Newspaper Article": "article-newspaper",
  Thesis: "thesis",
  Report: "report",
  "Government Document": "report",
  "Web Page": "webpage",
  Blog: "post-weblog",
  "Online Database": "webpage",
  "Aggregated Database": "dataset",
  Dataset: "dataset",
  "Online Multimedia": "webpage",
  "Multimedia Application": "software",
  "Personal Communication": "personal_communication",
  "Computer Program": "software",
  "Unpublished Work": "manuscript",
  Manuscript: "manuscript",
  Patent: "patent",
  "Audiovisual Material": "motion_picture",
  "Film or Broadcast": "broadcast",
  "Television Episode": "broadcast",
  Podcast: "broadcast",
  Music: "song",
  Artwork: "graphic",
  Figure: "graphic",
  Map: "map",
  Dictionary: "entry-dictionary",
  Encyclopedia: "entry-encyclopedia",
  Catalog: "book",
  Pamphlet: "pamphlet",
  Serial: "periodical",
  Standard: "standard",
  Statute: "legislation",
  "Legal Rule or Regulation": "regulation",
  Bill: "bill",
  Case: "legal_case",
  Hearing: "hearing",
  "Classical Work": "book",
  "Press Release": "article",
  Interview: "interview",
  "Discussion Forum": "post",
  "Social Media": "post",
  Generic: "article",
};

export function cslTypeFor(refTypeName: string, hasJournal: boolean): string {
  if (refTypeName.startsWith("Unused")) return hasJournal ? "article-journal" : "document";
  const t = CSL_TYPE_BY_EN_TYPE[refTypeName];
  if (t) return t;
  return hasJournal ? "article-journal" : "document";
}

/** "de Vos, Willem M\rTilg, Herbert" -> [["de Vos","Willem M"], ["Tilg","Herbert"]] */
export function parseAuthors(raw: string | null | undefined): string[][] {
  if (!raw) return [];
  const out: string[][] = [];
  for (const chunk of raw.split(/[\r\n]+/)) {
    const name = chunk.trim().replace(/,$/, "");
    if (!name) continue;
    // EndNote separates family and given names with the first comma.
    const idx = name.indexOf(",");
    if (idx > 0) {
      const family = name.slice(0, idx).trim();
      const given = name.slice(idx + 1).trim();
      out.push([family, given]);
    } else {
      out.push([name, ""]);
    }
  }
  return out;
}

function str(v: any): string {
  if (v == null) return "";
  return String(v).replace(/\r\n?/g, "\n").trim();
}

/** Year out of a free-text date, or "" when there is none. */
export function firstYear(s: string): string {
  const m = /\b(1[5-9]\d{2}|20\d{2}|21\d{2})\b/.exec(s || "");
  return m ? m[1] : "";
}

/**
 * Citation key: first author's family name + year, e.g. "deVos2022".
 * Restricted to [A-Za-z0-9] so it can never clash with markdown punctuation.
 */
export function makeCiteKey(authors: string[][], year: string, fallbackId: number): string {
  const family = authors.length ? authors[0][0] : "";
  const surname = family
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip accents
    .replace(/[^A-Za-z0-9]/g, "");
  const y = firstYear(year) || "nd";
  const key = (surname || "ref") + y;
  return /^[A-Za-z]/.test(key) ? key : `ref${fallbackId}`;
}

/**
 * Group membership blob: 4 bytes of header (format version 2), then a
 * little-endian uint32 count, then that many little-endian record ids.
 */
export function decodeGroupMembers(blob: Uint8Array | null | undefined): number[] {
  if (!blob || blob.length < 8) return [];
  const view = new DataView(blob.buffer, blob.byteOffset, blob.byteLength);
  const count = view.getUint32(4, true);
  const out: number[] = [];
  for (let i = 0; i < count; i++) {
    const at = 8 + i * 4;
    if (at + 4 > blob.length) break;
    out.push(view.getUint32(at, true));
  }
  return out;
}

/** Reads EndNote's custom/smart groups (name + member record ids). */
export async function readGroups(sqlJs: SqlJsStatic, bytes: Uint8Array): Promise<EndNoteGroup[]> {
  const db = new sqlJs.Database(bytes);
  const out: EndNoteGroup[] = [];
  try {
    const stmt = db.prepare("SELECT group_id, spec, members FROM groups");
    while (stmt.step()) {
      const row = stmt.getAsObject();
      const spec =
        typeof row.spec === "string"
          ? (row.spec as string)
          : new TextDecoder().decode(row.spec as Uint8Array);
      const name = /<name>([\s\S]*?)<\/name>/.exec(spec)?.[1]?.trim() || t("group.unnamed");
      out.push({
        id: Number(row.group_id),
        name,
        members: decodeGroupMembers(row.members as Uint8Array),
      });
    }
    stmt.free();
  } finally {
    db.close();
  }
  return out.sort((a, b) => a.name.localeCompare(b.name, "zh"));
}

/** Reads the `refs` table out of an .enl file and returns normalised records. */
export async function readLibrary(
  sqlJs: SqlJsStatic,
  bytes: Uint8Array,
  keyOverrides: Record<string, string> = {},
  refTypeNames: string[] = REF_TYPE_NAMES
): Promise<Ref[]> {
  const db = new sqlJs.Database(bytes);
  let rows: any[] = [];
  try {
    const stmt = db.prepare(
      `SELECT id, trash_state, reference_type, author, year, title, pages, secondary_title,
              volume, number, secondary_author, place_published, publisher, edition, keywords,
              type_of_work, date, abstract, url, isbn, alternate_title, accession_number,
              short_title, original_publication, electronic_resource_number, name_of_database,
              language, access_date, notes
       FROM refs`
    );
    while (stmt.step()) rows.push(stmt.getAsObject());
    stmt.free();
  } finally {
    db.close();
  }

  const refs: Ref[] = rows.map((r) => {
    const refType = Number(r.reference_type) || 0;
    const typeName = refTypeNames[refType] || "Generic";
    const authors = parseAuthors(r.author);
    const year = str(r.year) || firstYear(str(r.date));
    const doi = str(r.electronic_resource_number);
    const ref: Ref = {
      id: Number(r.id),
      refType,
      typeName,
      cslType: cslTypeFor(typeName, !!str(r.secondary_title)),
      authors,
      editors: parseAuthors(r.secondary_author),
      year,
      date: str(r.date),
      title: str(r.title),
      journal: str(r.secondary_title),
      volume: str(r.volume),
      issue: str(r.number),
      pages: str(r.pages),
      doi,
      url: str(r.url),
      abstract: str(r.abstract),
      keywords: str(r.keywords)
        .split(/[\r\n;]+/)
        .map((k) => k.trim())
        .filter(Boolean),
      publisher: str(r.publisher),
      place: str(r.place_published),
      edition: str(r.edition),
      isbn: str(r.isbn),
      issn: "",
      language: str(r.language),
      accession: str(r.accession_number),
      notes: str(r.notes),
      citeKey: "",
      trashed: str(r.trash_state) !== "" && str(r.trash_state) !== "0",
    };
    ref.citeKey = keyOverrides[String(ref.id)] || makeCiteKey(authors, year, ref.id);
    return ref;
  });

  // EndNote hides deleted records behind trash_state; drop them but keep the rest.
  const live = refs.filter((r) => !r.trashed);
  assignUniqueKeys(live, keyOverrides);
  return live;
}

/** Appends a/b/c… when two records would produce the same key. */
function assignUniqueKeys(refs: Ref[], overrides: Record<string, string>) {
  const seen = new Map<string, number>();
  for (const r of refs) {
    if (overrides[String(r.id)]) continue; // user-pinned keys stay untouched
    const base = r.citeKey;
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    if (n > 0) r.citeKey = base + String.fromCharCode(96 + n); // a, b, c
  }
}

/** Converts a Ref into a CSL-JSON item citeproc can consume. */
export function toCSL(ref: Ref): any {
  const item: any = {
    id: ref.citeKey,
    type: ref.cslType,
    title: ref.title || undefined,
  };
  if (ref.authors.length) {
    item.author = ref.authors.map(([family, given]) => ({ family, given: given || undefined }));
  }
  if (ref.editors.length) {
    item.editor = ref.editors.map(([family, given]) => ({ family, given: given || undefined }));
  }
  if (ref.year) {
    const y = Number(ref.year);
    item.issued = Number.isFinite(y) ? { "date-parts": [[y]] } : { literal: ref.year };
  }
  if (ref.cslType === "article-journal" || ref.cslType === "article-magazine") {
    if (ref.journal) item["container-title"] = ref.journal;
    if (ref.volume) item.volume = ref.volume;
    if (ref.issue) item.issue = ref.issue;
    if (ref.pages) item.page = ref.pages;
  } else if (ref.cslType === "chapter") {
    if (ref.journal) item["container-title"] = ref.journal;
    if (ref.pages) item.page = ref.pages;
    if (ref.publisher) item.publisher = ref.publisher;
    if (ref.place) item["publisher-place"] = ref.place;
    if (ref.edition) item.edition = ref.edition;
  } else {
    if (ref.publisher) item.publisher = ref.publisher;
    if (ref.place) item["publisher-place"] = ref.place;
    if (ref.edition) item.edition = ref.edition;
    if (ref.pages) item["number-of-pages"] = ref.pages;
    if (ref.journal && ref.cslType === "paper-conference") item["container-title"] = ref.journal;
  }
  if (ref.doi) item.DOI = ref.doi;
  if (ref.url) item.URL = ref.url;
  if (ref.abstract) item.abstract = ref.abstract;
  if (ref.isbn) item.ISBN = ref.isbn;
  if (ref.keywords.length) item.keyword = ref.keywords.join(", ");
  if (ref.language) item.language = ref.language;
  return item;
}
