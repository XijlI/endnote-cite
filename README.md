# EndNote Cite (Obsidian plugin)

Cite as you write with your **EndNote** library, then export to **Word** or **LaTeX**.
An Obsidian take on EndNote's Word add-in: the library is read straight out of
EndNote's own `.enl` database, so nothing has to be exported by hand.

*[中文说明](README.zh-CN.md)*

![EndNote Cite in Obsidian: formatted citations, live bibliography and the library sidebar](docs/screenshot.png)

## What it does

| | |
|---|---|
| **Library** | Opens `.enl` files read-only (they are SQLite under the hood) and reloads automatically whenever EndNote saves. |
| **Cite as you write** | Type `[@` in a note to get a searchable reference list; the citation is inserted as `[@citeKey]`. |
| **Live formatting** | `[@citeKey]` is rendered as `(de Vos et al., 2022)` or `[1]`, depending on the style. Put the cursor inside and the raw marker comes back for editing. |
| **Style** | Reads the output style currently selected in EndNote and maps it onto the closest CSL style; any `.csl` file can be used instead. |
| **Bibliography** | `insert bibliography` writes a formatted list, or drop a ` ```endnote-bib ` block into the note for a live list. |
| **Export** | `.docx` (with references, optionally styled by your own Word template), `.tex` + `.bib`, `.bib`, CSL-JSON. |
| **Library sidebar** | Search the library, browse EndNote groups, and insert a citation with one click. |
| **EndNote-native Word output** | A second Word mode that hands the document to Word + EndNote so they write real `ADDIN EN.CITE` fields — the same thing you get from *Insert Citation* in Word. |

## Two kinds of Word output

| | `Export to Word (.docx)` | `Export to Word (live EndNote fields)` |
|---|---|---|
| How it is produced | pandoc + citeproc, fully offline | pandoc → Word + EndNote `ENFormatBibliography` |
| Citation content | formatted text | real EndNote fields + traveling library |
| Change style later | no, re-export | yes — EndNote ▸ Update Citations and Bibliography |
| Edit a citation (add pages, delete) | no | yes — EndNote ▸ Edit & Manage Citations |
| Speed | ~1 s | ~10 s (Word and EndNote are driven invisibly) |
| Needs | pandoc | pandoc + Word + EndNote with the CWYW add-in |
| File name | `Note.docx` | `Note (EndNote).docx` |

## Requirements

- Desktop Obsidian 1.5+ (the plugin uses Node APIs, so mobile is not supported).
- EndNote (any version whose `.enl` is a SQLite file — EndNote 20/21/2025 all are).
- [pandoc](https://pandoc.org/installing.html) on `PATH` for the Word/LaTeX export.

## Install

1. Copy this folder into `<vault>/.obsidian/plugins/endnote-cite/` with
   `main.js`, `manifest.json` and `styles.css` in it.
2. Settings → Community plugins → enable **EndNote Cite**.
3. Open the plugin settings and check that the `.enl` path was detected.

## Writing

```markdown
The gut microbiome is central to host health [@deVos2022].
Dietary fibre feeds short-chain fatty acid producers [@Koh2016, pp. 1335-1336].
Multiple sources in one bracket: [@Shi2017; @deVos2022].
```

- `[@` → autocomplete; <kbd>Enter</kbd> inserts.
- <kbd>Ctrl/Cmd</kbd>+<kbd>P</kbd> → “EndNote: Insert citation” for the search dialog
  (<kbd>Shift</kbd>+<kbd>Enter</kbd> collects several references).
- `[@key, p. 12]` adds a page locator, matching pandoc's citation syntax.

## Exporting

Command palette → `EndNote: Export to Word (.docx)` / `EndNote: Export to LaTeX (.tex + .bib)`.

Exports land next to the note (or in the folder set in the settings). Word files
keep the note's name; LaTeX files are slugged (`My Paper` → `My_Paper.tex`) because
BibTeX does not handle spaces in `\bibliography{}`.

To compile the LaTeX output:

```bash
pdflatex My_Paper.tex
bibtex   My_Paper
pdflatex My_Paper.tex
pdflatex My_Paper.tex
```

## EndNote-native Word output

`EndNote: Export to Word (live EndNote fields)` produces a `.docx` that EndNote treats as
its own. The plugin converts every `[@key]` into EndNote's temporary citation
syntax (`{Koh, 2016 #4@1335}`), runs pandoc, then drives Word and EndNote through
`bridge/format-docx.ps1` so that **EndNote itself** rewrites them into
`ADDIN EN.CITE` fields with the full record attached and generates the
`ADDIN EN.REFLIST` bibliography.

In Word you can then use the EndNote ribbon exactly as if you had cited there:

- **Update Citations and Bibliography** — reformat after changing the output
  style in EndNote, adding references, or reordering text.
- **Edit & Manage Citation(s)** — add page numbers, prefixes, remove a citation.
- Right-click → *Edit Library Reference* jumps to the record in EndNote.

Requirements and caveats:

- Word (desktop) and EndNote with the Cite While You Write add-in must be
  installed; both are driven invisibly and closed afterwards if the plugin
  started them.
- EndNote must be running **with the same library open** — record numbers are
  resolved inside EndNote. The bridge starts EndNote with the configured library
  if it is not running.
- EndNote scans the whole document for `{...}` patterns. If your note contains
  text that looks like `{Author, #12}`, EndNote may stop and ask you to pick a
  reference; the export then times out with a hint.
- The bibliography is appended at the end of the document, under the last heading
  (the plugin reuses a trailing “References” heading, or adds one).

## The library sidebar

Click the **library icon** in the left ribbon (or run *EndNote: Open library sidebar*) to
open a panel on the right:

- **Search** — author, title, year, journal or citation key, ranked by relevance.
  `Enter` inserts the first hit, `Esc` clears the box.
- **Groups** — a single row showing the current group and its count; click it and a
  floating list of every EndNote group drops down (counts on the right, current one
  highlighted). Click a group to filter, click anywhere else or press `Esc` to close.
  The list comes straight from the library's `groups` table.
- **`+` on any row** — drops `[@key]` at the caret of the note you were last
  editing. If the caret is already inside a `[...]` it appends `; @key` instead.
- **Click the row itself** — expands the record (citation key, volume/issue/pages,
  DOI, type, abstract) with a *copy citation key* button; click anywhere on the row
  again to collapse it. The whole row is the target, and `Enter` toggles it from the
  keyboard, so a narrow sidebar is no obstacle.
- Rows already cited in the current note show a ✓ and a muted title.

The list follows the library file: saving in EndNote refreshes it within a few
seconds.

## Style notes

EndNote's own `.ens` styles are a proprietary format, so the plugin reads the
*name* of the style EndNote has selected (Windows registry,
`HKCU\Software\ISI ResearchSoft\EndNote`) and picks the nearest bundled CSL style.
Bundled: Harvard (Cite Them Right), Nature, APA, Chicago, GB/T 7714-2015
(numeric and author-date), IEEE, AMA, Elsevier Vancouver, Springer Basic.
For anything else, download a `.csl` from <https://zotero.org/styles> and point the
settings at it.

## How it works

```
.enl (SQLite) ──sql.js──▶ references ──▶ CSL-JSON ──▶ citeproc-js ──▶ editor preview
                                                   └─▶ pandoc --citeproc ─▶ .docx
                                                   └─▶ BibTeX ────────────▶ .tex + .bib
```

The preview and the export share the same CSL file, so what you read while
writing is what lands in the document.

## Development

```bash
npm install
npm run build     # tsc + esbuild → main.js
node test/build.mjs && node test/.build/plugin-test.cjs   # headless end-to-end test
```

Install by copying `main.js`, `manifest.json`, `styles.css` **and the `bridge/`
folder** into `<vault>/.obsidian/plugins/endnote-cite/` — without `bridge/` the
EndNote-field Word export cannot run.

## License

MIT.
