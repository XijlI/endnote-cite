/** Bundled CSL styles. The XML is inlined at build time by esbuild's text loader. */

/**
 * Line endings must never reach the bundle: the community directory rebuilds the
 * plugin and compares the result with the committed `main.js`, so a CRLF checkout
 * would produce a different bundle for the same source.
 */
const lf = (s: string) => s.replace(/\r\n?/g, "\n");

import harvardCiteThemRight from "../assets/styles/harvard-cite-them-right.csl";
import nature from "../assets/styles/nature.csl";
import apa from "../assets/styles/apa.csl";
import chicagoAuthorDate from "../assets/styles/chicago-author-date.csl";
import gbNumeric from "../assets/styles/china-national-standard-gb-t-7714-2015-numeric.csl";
import gbAuthorDate from "../assets/styles/china-national-standard-gb-t-7714-2015-author-date.csl";
import ieee from "../assets/styles/ieee.csl";
import ama from "../assets/styles/american-medical-association.csl";
import elsevierVancouver from "../assets/styles/elsevier-vancouver.csl";
import springerBrackets from "../assets/styles/springer-basic-brackets.csl";

export interface StylePreset {
  id: string;
  label: string;
  xml: string;
  /** Extra name fragments used to match EndNote's .ens style names. */
  aliases?: string[];
}

export const STYLE_PRESETS: StylePreset[] = [
  {
    id: "harvard-cite-them-right",
    label: "Harvard (Cite Them Right) — author-date",
    xml: lf(harvardCiteThemRight),
    aliases: ["cite them right", "harvard"],
  },
  { id: "nature", label: "Nature — numeric", xml: lf(nature), aliases: ["nature"] },
  { id: "apa", label: "APA 7th — author-date", xml: lf(apa), aliases: ["apa", "american psychological"] },
  {
    id: "chicago-author-date",
    label: "Chicago — author-date",
    xml: lf(chicagoAuthorDate),
    aliases: ["chicago"],
  },
  {
    id: "gb-numeric",
    label: "GB/T 7714-2015 — numeric",
    xml: lf(gbNumeric),
    aliases: ["gb/t", "gbt", "7714", "chinese"],
  },
  {
    id: "gb-author-date",
    label: "GB/T 7714-2015 — author-date",
    xml: lf(gbAuthorDate),
    aliases: ["gb/t", "gbt", "7714"],
  },
  { id: "ieee", label: "IEEE — numeric", xml: lf(ieee), aliases: ["ieee"] },
  {
    id: "american-medical-association",
    label: "AMA — numeric",
    xml: lf(ama),
    aliases: ["american medical", "jama"],
  },
  {
    id: "elsevier-vancouver",
    label: "Elsevier Vancouver — numeric",
    xml: lf(elsevierVancouver),
    aliases: ["vancouver", "elsevier"],
  },
  {
    id: "springer-basic-brackets",
    label: "Springer Basic — numeric",
    xml: lf(springerBrackets),
    aliases: ["springer"],
  },
];

export function findPreset(id: string): StylePreset | undefined {
  return STYLE_PRESETS.find((s) => s.id === id);
}

function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/\b(\d+(st|nd|rd|th))\b/g, " ")
    .replace(/\bcopy\b/g, " ")
    .replace(/[^a-z0-9\/]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Maps EndNote's output-style name (e.g. "Cite Them Right-Harvard 13th.ens")
 * onto the closest bundled CSL style, since .ens files are not CSL.
 */
export function matchPreset(endNoteStyleName: string): StylePreset | undefined {
  if (!endNoteStyleName) return undefined;
  const name = norm(endNoteStyleName.replace(/\.ens$/i, "").replace(/[-_]/g, " "));
  let best: { preset: StylePreset; score: number } | undefined;
  for (const preset of STYLE_PRESETS) {
    const words = [norm(preset.label.split("—")[0]), ...(preset.aliases ?? []).map(norm)];
    for (const w of words) {
      if (!w) continue;
      let score = 0;
      if (name === w) score = 100;
      else if (name.includes(w)) score = 60 + w.length;
      else {
        const parts = w.split(" ").filter((p) => p.length > 2);
        const hits = parts.filter((p) => name.includes(p)).length;
        if (parts.length && hits === parts.length) score = 40 + hits;
      }
      if (score && (!best || score > best.score)) best = { preset, score };
    }
  }
  return best?.preset;
}
