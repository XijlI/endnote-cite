/**
 * Tiny UI translation layer. English is the default; 简体中文 is a full second
 * copy. Strings live here instead of inline so both languages stay in sync and
 * the language can be switched from settings at runtime.
 */

export type Lang = "en" | "zh";
export type LangSetting = "en" | "zh" | "auto";

type Entry = { en: string; zh: string };

const DICT: Record<string, Entry> = {
  // ── ribbon / commands ────────────────────────────────────
  "ribbon.library": { en: "EndNote library", zh: "EndNote 文献库" },
  "cmd.openExplorer": { en: "Open library sidebar", zh: "打开文献库侧边栏" },
  "cmd.insertCitation": { en: "Insert citation", zh: "插入引用" },
  "cmd.insertBibliography": { en: "Insert bibliography", zh: "插入参考文献表" },
  "cmd.exportDocx": { en: "Export to Word (.docx)", zh: "导出为 Word (.docx)" },
  "cmd.exportDocxEndNote": {
    en: "Export to Word (live EndNote fields)",
    zh: "导出为 Word（EndNote 可更新域）",
  },
  "cmd.exportTex": { en: "Export to LaTeX (.tex + .bib)", zh: "导出为 LaTeX (.tex + .bib)" },
  "cmd.exportBib": { en: "Export BibTeX (.bib)", zh: "导出 BibTeX (.bib)" },
  "cmd.exportCslJson": { en: "Export CSL-JSON (.json)", zh: "导出 CSL-JSON (.json)" },
  "cmd.reloadLibrary": { en: "Reload EndNote library", zh: "重新加载 EndNote 文献库" },

  // ── library status ───────────────────────────────────────
  "status.none": { en: "No references loaded yet", zh: "尚未载入文献" },
  "status.loaded": { en: "Loaded {n} references", zh: "已载入 {n} 条文献" },
  "msg.libraryUpdated": {
    en: "EndNote library updated: {n} references",
    zh: "EndNote 文献库已更新：{n} 条",
  },
  "msg.libraryLoaded": {
    en: "Loaded {n} references from {path}",
    zh: "已载入 {n} 条文献：{path}",
  },
  "msg.libraryFailed": { en: "Could not read the library: {error}", zh: "读取文献库失败：{error}" },
  "msg.noEnl": { en: "No .enl file found", zh: "没找到 .enl 文件" },
  "msg.cslMissing": { en: "Cannot read the custom CSL: {path}", zh: "读不到自定义 CSL：{path}" },
  "msg.loadLibraryFirst": {
    en: "Load an EndNote library first",
    zh: "先载入 EndNote 文献库",
  },
  "msg.noCitationsInNote": { en: "This note has no citations yet", zh: "这篇笔记里还没有引用" },
  "msg.exportFailed": { en: "Export failed: {error}", zh: "导出失败：{error}" },
  "ref.notFound": {
    en: "Not in the EndNote library: {key}",
    zh: "未在 EndNote 库中找到：{key}",
  },
  "group.unnamed": { en: "Untitled group", zh: "未命名分组" },

  // ── bibliography block ───────────────────────────────────
  "bib.cannotRead": { en: "(cannot read this note)", zh: "（无法读取当前笔记）" },
  "bib.header": { en: "{title} · {n}", zh: "{title} · {n} 条" },
  "bib.refresh": { en: "↻ Refresh", zh: "↻ 刷新" },
  "bib.empty": { en: "No citations in this note yet.", zh: "这篇笔记里还没有引用。" },
  "bib.missing": { en: "Not in the library: {keys}", zh: "库中找不到：{keys}" },

  // ── insert dialog ────────────────────────────────────────
  "insert.title": { en: "Insert citation", zh: "插入引用" },
  "insert.placeholder": {
    en: "Search author / title / year / journal — Shift+Enter adds to the set",
    zh: "搜索作者 / 标题 / 年份 / 期刊，Shift+Enter 加入多条",
  },
  "insert.empty": { en: "No matching references", zh: "没有匹配的文献" },

  // ── export ───────────────────────────────────────────────
  "export.pandocFailed": { en: "pandoc failed: {error}", zh: "pandoc 失败：{error}" },
  "export.docxDone": { en: "Word exported: {path}", zh: "Word 已导出：{path}" },
  "export.noCitations": {
    en: "This note has no [@key] citations",
    zh: "这篇笔记里没有 [@key] 引用",
  },
  "export.unknownKeys": {
    en: "Not in the library (kept as-is): {keys}",
    zh: "这些引用键不在文献库里，已原样保留：{keys}",
  },
  "export.endnoteWorking": {
    en: "Asking Word + EndNote to build the citation fields (Word opens briefly)…",
    zh: "正在让 Word + EndNote 生成引用域，请稍候（会短暂调用 Word）…",
  },
  "export.endnoteBraces": {
    en: "\nNote: the note contains text like {braces}, which EndNote may read as a temporary citation and stop to ask you to pick a reference.",
    zh: "\n注意：笔记里有像临时引用的花括号文本 {braces}，EndNote 可能会停下来等你确认。",
  },
  "export.endnoteDone": {
    en: "Word exported with {n} live EndNote fields: {path}",
    zh: "Word 已导出（EndNote 可更新域，{n} 个域）：{path}",
  },
  "export.texDone": { en: "LaTeX exported: {tex} (+ {bib})", zh: "LaTeX 已导出：{tex}（+ {bib}）" },
  "export.bibDone": { en: "BibTeX exported: {path}", zh: "BibTeX 已导出：{path}" },
  "export.cslDone": { en: "CSL-JSON exported: {path}", zh: "CSL-JSON 已导出：{path}" },

  // ── bridge ───────────────────────────────────────────────
  "bridge.missingScript": {
    en: "Missing bridge/format-docx.ps1 (expected in {dir})",
    zh: "缺少 bridge/format-docx.ps1（应位于 {dir}）",
  },
  "bridge.failed": {
    en: "Word/EndNote automation failed: {error}",
    zh: "Word/EndNote 自动化失败：{error}",
  },
  "bridge.noResult": { en: "The bridge returned nothing", zh: "没有返回结果" },

  // ── sidebar ──────────────────────────────────────────────
  "exp.title": { en: "EndNote library", zh: "EndNote 文献库" },
  "exp.search": { en: "Search references…", zh: "搜索文献…" },
  "exp.scopeLabel": { en: "Choose group", zh: "选择分组" },
  "exp.all": { en: "All references", zh: "全部文献" },
  "exp.notLoaded": { en: "No library loaded yet", zh: "还没有载入文献库" },
  "exp.setPath": { en: "Set the .enl path in settings", zh: "在设置里指定 .enl 文件" },
  "exp.noMatch": { en: "No matching references", zh: "没有匹配的文献" },
  "exp.emptyGroup": { en: "This group is empty", zh: "这个分组是空的" },
  "exp.status": { en: "{scope} · {n}", zh: "{scope} · {n} 条" },
  "exp.truncated": { en: " (truncated)", zh: "（已截断）" },
  "exp.untitled": { en: "(untitled)", zh: "(无标题)" },
  "exp.ariaInsert": { en: "Insert @{key}", zh: "插入 @{key}" },
  "exp.copyKey": { en: "Copy citation key", zh: "复制引用键" },
  "exp.copied": { en: "Copied @{key}", zh: "已复制 @{key}" },
  "exp.openNoteFirst": {
    en: "Open a note and put the cursor where the citation should go",
    zh: "先打开一篇笔记并把光标放到要插入引用的位置",
  },
  "exp.inserted": { en: "Inserted @{key}", zh: "已插入 @{key}" },

  // ── settings ─────────────────────────────────────────────
  "set.lang.heading": { en: "Language", zh: "界面语言" },
  "set.lang.name": { en: "Interface language", zh: "界面语言" },
  "set.lang.desc": {
    en: "Language of menus, notices and this settings page. Defaults to English.",
    zh: "菜单、提示和设置页使用的语言。默认英文。",
  },
  "set.lang.en": { en: "English", zh: "English（英文）" },
  "set.lang.zh": { en: "简体中文", zh: "简体中文" },
  "set.lang.auto": { en: "Follow Obsidian", zh: "跟随 Obsidian" },
  "set.lang.reload": {
    en: "Language applied. Reopen the settings tab if a label still shows the old language.",
    zh: "语言已切换。若仍有旧语言残留，重开这个设置页即可。",
  },

  "set.library.heading": { en: "EndNote library", zh: "EndNote 文献库" },
  "set.path.name": { en: ".enl file", zh: ".enl 文件路径" },
  "set.path.desc": {
    en: "Path to your EndNote library. Leave empty to look in Documents.",
    zh: "EndNote 的库文件路径。留空则自动在「文档」文件夹中查找。",
  },
  "set.path.reload": { en: "Reload", zh: "重新加载" },

  "set.style.heading": { en: "Citation style", zh: "引用样式" },
  "set.follow.name": {
    en: "Follow the Output Style selected in EndNote",
    zh: "跟随 EndNote 里选中的 Output Style",
  },
  "set.follow.desc": {
    en: "Reads the current style name from EndNote's registry and maps it to the closest CSL style (the .ens format itself is proprietary).",
    zh: "从 EndNote 的注册表设置中读取当前样式名，自动匹配最接近的 CSL 样式（EndNote 的 .ens 格式无法直接解析）。",
  },
  "set.follow.status": {
    en: "EndNote style: {name} → matched {match}",
    zh: "EndNote 当前样式：{name} → 匹配到 {match}",
  },
  "set.csl.name": { en: "CSL style", zh: "CSL 样式" },
  "set.csl.desc": {
    en: "Bundled styles. When “follow EndNote” is on, the automatic match wins.",
    zh: "内置样式；若「跟随 EndNote」开启则以自动匹配结果为准。",
  },
  "set.csl.custom": { en: "Custom .csl file…", zh: "自定义 .csl 文件…" },
  "set.customCsl.name": { en: "Custom CSL file", zh: "自定义 CSL 文件" },
  "set.customCsl.desc": {
    en: "Absolute path, used together with “Custom .csl file” above. Styles can be downloaded from zotero.org/styles.",
    zh: "填绝对路径，配合上面选「自定义 .csl 文件」。可从 zotero.org/styles 下载。",
  },

  "set.writing.heading": { en: "Writing", zh: "写作" },
  "set.livePreview.name": { en: "Render formatted citations in the editor", zh: "正文里显示格式化后的引用" },
  "set.livePreview.desc": {
    en: "Shows [@key] as (Smith, 2020). Moving the cursor into a citation reveals the source again.",
    zh: "开启后 [@key] 显示为 (Smith, 2020)；光标移到引用上会回退成源码，方便编辑。",
  },
  "set.bibTitle.name": { en: "Bibliography heading", zh: "参考文献表标题" },
  "set.bibTitle.desc": {
    en: "Heading used when inserting a bibliography or exporting.",
    zh: "插入参考文献列表 / 导出时使用的小标题。",
  },

  "set.export.heading": { en: "Export", zh: "导出" },
  "set.pandoc.name": { en: "pandoc path", zh: "pandoc 路径" },
  "set.pandoc.desc": {
    en: "Uses pandoc from PATH by default; set a full path if exporting fails.",
    zh: "默认调用 PATH 中的 pandoc；若导出报错请填写完整路径。",
  },
  "set.pandoc.check": { en: "Check", zh: "检测" },
  "set.pandoc.ok": { en: "pandoc available: {v}", zh: "pandoc 可用：{v}" },
  "set.pandoc.bad": { en: "pandoc not found — set the full path", zh: "找不到 pandoc，请填写完整路径" },
  "set.template.name": { en: "Word template (.docx)", zh: "Word 模板 (.docx)" },
  "set.template.desc": {
    en: "Optional. pandoc takes fonts, margins and spacing from it — save a styled document in Word and point here.",
    zh: "可选。pandoc 用它来决定字体、页边距、行距等。可在 Word 里改好样式后另存为模板。",
  },
  "set.folder.name": { en: "Export folder", zh: "导出文件夹" },
  "set.folder.desc": {
    en: "Vault-relative path, e.g. Exports. Empty = next to the note.",
    zh: "相对 vault 的路径，例如 Exports。留空 = 导到笔记所在文件夹。",
  },
  "set.usage": {
    en: "Type [@ in a note to trigger completion, Enter inserts. The library sidebar (ribbon icon) gives search, groups and a one-click +.",
    zh: "用法：正文输入 [@ 触发补全 → 回车插入；侧边栏（书本图标）可搜索、看分组、点 + 插入。",
  },

  "set.fields.heading": { en: "EndNote field export", zh: "EndNote 可更新域导出" },
  "set.fields.desc": {
    en: "“Export to Word (live EndNote fields)” writes EndNote temporary citations first, then drives Word + EndNote so they generate real ADDIN EN.CITE fields and the bibliography. In Word you can then use Update Citations and Bibliography. Requires desktop Word and EndNote with the Cite While You Write add-in; Word opens briefly during export.",
    zh: "命令「导出为 Word（EndNote 可更新域）」会先把引用写成 EndNote 临时引用，再调用 Word + EndNote 让它们自己生成 ADDIN EN.CITE 域和参考文献表。导出后 Word 里可用 EndNote 的「Update Citations and Bibliography」换样式、改引用。需要装 Word 和带 CWYW 加载项的 EndNote；导出时会短暂打开 Word。",
  },
  "set.endnoteExe.name": { en: "EndNote.exe path", zh: "EndNote.exe 路径" },
  "set.endnoteExe.desc": {
    en: "Leave empty to auto-detect (EndNote 20/21/2025 under Program Files).",
    zh: "留空则自动查找（Program Files 里的 EndNote 20/21/2025）。",
  },
};

let current: Lang = "en";

export function setLanguage(lang: Lang): void {
  current = lang === "zh" ? "zh" : "en";
}

export function getLanguage(): Lang {
  return current;
}

/** Resolves the setting ("auto" follows Obsidian's own UI language). */
export function resolveLanguage(setting: LangSetting | undefined): Lang {
  if (setting === "zh") return "zh";
  if (setting === "en" || !setting) return "en";
  try {
    const raw =
      (typeof window !== "undefined" && window.localStorage?.getItem("language")) ||
      (typeof navigator !== "undefined" ? navigator.language : "") ||
      "";
    return /^zh/i.test(raw) ? "zh" : "en";
  } catch {
    return "en";
  }
}

/** Translates a key, filling `{name}` placeholders. Unknown keys pass through. */
export function t(key: string, vars?: Record<string, string | number>): string {
  const entry = DICT[key];
  let text = entry ? (current === "zh" ? entry.zh : entry.en) : key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) text = text.split(`{${k}}`).join(String(v));
  }
  return text;
}
