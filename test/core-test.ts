/**
 * Headless smoke test: read the real EndNote library, format citations with
 * citeproc, and dump a CSL-JSON file for the pandoc parity check.
 * Run: node test/build.mjs && node test/.build/core-test.cjs
 */
import fs from "fs";
import os from "os";
import path from "path";
import initSqlJs from "sql.js";
import { readLibrary, toCSL, parseRefTypeTable, REF_TYPE_NAMES } from "../src/endnote";
import { CiteEngine } from "../src/csl";
import { findCitations } from "../src/citation";

const HOME = os.homedir();
const ENL = process.env.ENL_PATH || path.join(HOME, "Documents", "My EndNote Library.enl");
const wasm = fs.readFileSync(
  process.env.SQL_WASM || path.join(process.cwd(), "node_modules", "sql.js", "dist", "sql-wasm.wasm")
);

async function main() {
  const SQL = await initSqlJs({ wasmBinary: wasm });
  const bytes = fs.readFileSync(ENL);
  const rtPath = path.join(process.env.APPDATA || "", "EndNote", "RefTypeTable.xml");
  const typeNames = (fs.existsSync(rtPath) && parseRefTypeTable(fs.readFileSync(rtPath, "utf8"))) || REF_TYPE_NAMES;
  console.log(`ref type table: ${typeNames.length} entries (from ${fs.existsSync(rtPath) ? "EndNote" : "builtin"})`);
  const refs = await readLibrary(SQL, new Uint8Array(bytes), {}, typeNames);
  console.log(`refs read: ${refs.length}`);
  const keys = new Set(refs.map((r) => r.citeKey));
  console.log(`unique keys: ${keys.size}`);
  const typeCount: Record<string, number> = {};
  for (const r of refs) typeCount[r.typeName] = (typeCount[r.typeName] || 0) + 1;
  console.log("types:", typeCount);
  console.log("\nsample:");
  for (const r of refs.slice(0, 4)) {
    console.log(`  ${r.citeKey} | ${r.typeName} -> ${r.cslType} | ${r.authors.map((a) => a.join(", ")).join(" / ")} | ${r.year} | ${r.title.slice(0, 60)} | ${r.journal} ${r.volume}(${r.issue}):${r.pages} doi=${r.doi}`);
  }
  const missingAuthor = refs.filter((r) => !r.authors.length).length;
  const missingYear = refs.filter((r) => !r.year).length;
  console.log(`\nno authors: ${missingAuthor}, no year: ${missingYear}`);

  const items = refs.map(toCSL);
  fs.writeFileSync(path.join(os.tmpdir(), "en-csl.json"), JSON.stringify(items, null, 1));

  const stylePath = path.join(process.cwd(), "assets/styles/harvard-cite-them-right.csl");
  const localePath = path.join(process.cwd(), "assets/locales/locales-en-US.xml");
  const styleXml = fs.readFileSync(stylePath, "utf8");
  const localeXml = fs.readFileSync(localePath, "utf8");

  const doc = `Gut microbiome matters [@${items[0].id}] and so does the next one [@${items[1].id}; @${items[2].id}, p. 5].
Then again [@${items[0].id}].`;
  const clusters = findCitations(doc);
  console.log(`\nclusters found: ${clusters.length}`, clusters.map((c) => c.items.map((i) => i.id)));

  const harvard = new CiteEngine({ styleXml, localeXml, items });
  console.log("style title:", harvard.styleTitle, "| numeric:", harvard.numeric);
  const outHarvard = harvard.formatClusters(clusters);
  console.log("\nHARVARD citations:");
  outHarvard.forEach((s) => console.log("  " + s));
  const bib = harvard.bibliography([]);
  console.log(`\nHARVARD bibliography (${bib.entries.length} entries):`);
  bib.entries.slice(0, 3).forEach((e) => console.log("  " + e.replace(/<[^>]+>/g, "").slice(0, 140)));

  const natureXml = fs.readFileSync(path.join(process.cwd(), "assets/styles/nature.csl"), "utf8");
  const nature = new CiteEngine({ styleXml: natureXml, localeXml, items });
  console.log("\nNATURE numeric:", nature.numeric);
  nature.formatClusters(clusters).forEach((s) => console.log("  " + s));

  const gbXml = fs.readFileSync(path.join(process.cwd(), "assets/styles/china-national-standard-gb-t-7714-2015-numeric.csl"), "utf8");
  const gb = new CiteEngine({ styleXml: gbXml, localeXml: fs.readFileSync(path.join(process.cwd(), "assets/locales/locales-zh-CN.xml"), "utf8"), items, lang: "zh-CN" });
  console.log("\nGB/T numeric:", gb.numeric);
  gb.formatClusters(clusters).forEach((s) => console.log("  " + s));
  const gbBib = gb.bibliography([]);
  gbBib.entries.slice(0, 2).forEach((e) => console.log("  BIB " + e.replace(/<[^>]+>/g, "").slice(0, 160)));
}

main().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});
