/** Shared types for the EndNote Cite plugin. */

/** A single bibliography record, normalised out of the EndNote SQLite file. */
export interface Ref {
  id: number;
  /** EndNote numeric reference type (0 = Journal Article, ...). */
  refType: number;
  typeName: string;
  /** CSL-JSON document type. */
  cslType: string;
  authors: string[][]; // [family, given]
  editors: string[][];
  year: string;
  date: string;
  title: string;
  journal: string; // secondary_title
  volume: string;
  issue: string;
  pages: string;
  doi: string;
  url: string;
  abstract: string;
  keywords: string[];
  publisher: string;
  place: string;
  edition: string;
  isbn: string;
  issn: string;
  language: string;
  accession: string;
  notes: string;
  /** Generated citation key, e.g. deVos2022. */
  citeKey: string;
  /** True when the record sits in EndNote's trash. */
  trashed: boolean;
}

/** A parsed `[@a; @b]` citation cluster inside a note. */
export interface CitationCluster {
  from: number;
  to: number;
  raw: string;
  items: { id: string; prefix?: string; suffix?: string; locator?: string }[];
}

/** A group (custom or smart) defined in the EndNote library. */
export interface EndNoteGroup {
  id: number;
  name: string;
  /** Record ids (refs.id) belonging to the group. */
  members: number[];
}

export interface StyleInfo {
  /** File name inside assets/styles, e.g. harvard-cite-them-right.csl */
  file: string;
  /** Human label shown in settings. */
  label: string;
  /** CSL style title, filled in after parsing. */
  title?: string;
  numeric: boolean;
}
