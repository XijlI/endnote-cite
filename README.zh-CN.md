# EndNote Cite（Obsidian 插件）

在 Obsidian 里像用 Word 的 EndNote 插件那样：**边写边插入引用**，文献直接读自 EndNote
的 `.enl` 库，写完一键**导出 Word / LaTeX**。

> EndNote Cite 是独立的第三方插件，与 Clarivate（EndNote 的出品方）和 Obsidian 均无隶属、
> 授权或赞助关系。「EndNote」是 Clarivate 的商标，这里仅用于说明插件读取的是哪种文献库格式。
> 使用本插件仍需你自备 EndNote 授权。

*[English](README.md)*

![EndNote Cite 在 Obsidian 里：格式化引用、实时参考文献表和文献库侧边栏](docs/screenshot.png)

## 能做什么

| 功能 | 说明 |
|---|---|
| **读文献库** | `.enl` 本身就是 SQLite 数据库，插件只读打开；EndNote 里一增删文献，Obsidian 里 5 秒内自动刷新。 |
| **边写边引** | 正文输入 `[@` 弹出搜索框（作者 / 标题 / 年份 / 期刊），回车插入 `[@引用键]`。 |
| **实时格式化** | `[@deVos2022]` 在正文里显示成 `(de Vos et al., 2022)` 或 `[1]`，光标移进去就变回源码，方便改。 |
| **跟随 EndNote 样式** | 读取 EndNote 当前选中的 Output Style 名字，自动匹配最接近的 CSL 样式；也可指定任意 `.csl`。 |
| **参考文献表** | 命令面板“插入参考文献表”，或在笔记里放一个 ` ```endnote-bib ` 代码块，它会自己保持最新。 |
| **导出** | `.docx`（带参考文献，可套自己的 Word 模板）、`.tex` + `.bib`、`.bib`、CSL-JSON。 |
| **文献库侧边栏** | 搜索文献、浏览 EndNote 分组、点一下加号就插入引用。 |
| **EndNote 原生 Word 输出** | 第二种 Word 导出：交给 Word + EndNote 自己写 `ADDIN EN.CITE` 域，和在 Word 里点「Insert Citation」得到的完全一样。 |

## 两种 Word 导出怎么选

| | `导出为 Word (.docx)` | `导出为 Word（EndNote 可更新域）` |
|---|---|---|
| 生成方式 | pandoc + citeproc，全程离线 | pandoc → 由 Word + EndNote 执行 `ENFormatBibliography` |
| 引用内容 | 排版好的文字 | 真正的 EndNote 域 + 旅行图书馆 |
| 以后换样式 | 不能，只能重新导出 | 能 —— EndNote ▸ Update Citations and Bibliography |
| 改引用（加页码、删掉） | 不能 | 能 —— EndNote ▸ Edit & Manage Citations |
| 速度 | 约 1 秒 | 约 10 秒（后台驱动 Word 和 EndNote） |
| 依赖 | pandoc | pandoc + Word + 装了 CWYW 加载项的 EndNote |
| 文件名 | `笔记.docx` | `笔记 (EndNote).docx` |

## 隐私与本地文件

Obsidian 的插件政策要求明确说明"访问库外文件"的行为，所以：

- **不联网、无遥测。** 插件不会连接任何服务器，没有统计、没有更新检查、没有崩溃上报。
- **只读一个库外文件** —— 你指定路径的那个 `.enl` EndNote 文献库（通常在
  `文档\My EndNote Library.enl`）。EndNote 就把库放在那里，这也是它必须在库外被读取的
  唯一原因。文件以**只读**方式打开，插件从不写入；SQLite 需要稳定快照时会先复制一份到
  临时目录再读。
- **导出时才调用本机工具**：文本导出用 `pandoc`；Word 真 EndNote 域导出在 Windows 上
  通过 COM 调用你本机安装的 Word 和 EndNote。数据不会离开你的电脑。

## 前置条件

- 桌面版 Obsidian 1.5 以上（用到 Node 能力，移动端不支持）。
- EndNote（`.enl` 为 SQLite 的版本，EndNote 20/21/2025 都是）。
- 导出 Word/LaTeX 需要 [pandoc](https://pandoc.org/installing.html) 在 PATH 里。

## 安装

1. 把本文件夹放到 `<你的 vault>/.obsidian/plugins/endnote-cite/`，里面要有
   `main.js`、`manifest.json`、`styles.css`。
2. 设置 → 第三方插件 → 启用 **EndNote Cite**。
3. 打开插件设置，确认 `.enl` 路径已被自动识别。

## 写作

```markdown
肠道菌群与宿主健康密切相关 [@deVos2022]。
膳食纤维为短链脂肪酸产生菌提供底物 [@Koh2016, pp. 1335-1336]。
一个方括号里放多条：[@Shi2017; @deVos2022]。
```

- 输入 `[@` 触发补全，回车插入。
- <kbd>Ctrl/Cmd</kbd>+<kbd>P</kbd> → “EndNote: 插入引用”打开搜索窗，
  <kbd>Shift</kbd>+<kbd>Enter</kbd> 可以一次挑多条。
- `[@key, p. 12]` 加页码，语法与 pandoc 一致，导出时不会丢。

## 参考文献表怎么放

文末的参考文献表有两种做法。

**写成静态文字** —— 命令面板 →「插入参考文献表」。它把当前格式化好的列表一次性写进笔记，
简单，但之后你改了引用它不会跟着变。

**用实时代码块** —— 在笔记里加一个空的 `endnote-bib` 代码块：

````markdown
## 参考文献

```endnote-bib
```
````

插件会把这个代码块渲染成整篇笔记里所有 `[@key]` 的参考文献表。列表**不写进笔记正文**，
源文件里永远只有那两行。它会在这些时候自动重画：

- 你新增或删除一条引用时（停止打字约 0.5 秒后）；
- EndNote 保存了文献库时（5 秒内轮询到）：新增的文献、改过的作者/年份都会更新；
- 切换输出样式或界面语言时；
- 点标题栏右边的 `↻ Refresh`。

表头文字来自 **设置 ▸ EndNote Cite ▸ 参考文献表标题**（默认「References」）。
导出时这个代码块会被忽略 —— Word / LaTeX / BibTeX 都自己生成参考文献表，所以留着没关系。

## 导出

命令面板 → `EndNote: 导出为 Word (.docx)` / `导出为 LaTeX (.tex + .bib)`。

导出文件放在笔记旁边（或设置里指定的文件夹）。Word 保留原名；
LaTeX 的文件名会把空格换成下划线（`My Paper` → `My_Paper.tex`），
因为 BibTeX 的 `\bibliography{}` 不支持空格。

编译 LaTeX：

```bash
pdflatex My_Paper.tex
bibtex   My_Paper
pdflatex My_Paper.tex
pdflatex My_Paper.tex
```

## EndNote 原生 Word 输出（引用可更新）

命令 `EndNote: 导出为 Word（EndNote 可更新域）` 生成的 `.docx` 会被 EndNote 当成自己的文档：

1. 插件把每个 `[@key]` 换成 EndNote 的临时引用 `{Koh, 2016 #4@1335}`；
2. pandoc 先排好版；
3. 后台启动 Word，调用 EndNote 的 `ENFormatBibliography` 宏，**让 EndNote 自己**
   把临时引用改写成 `ADDIN EN.CITE` 域（内嵌完整文献记录），并生成
   `ADDIN EN.REFLIST` 参考文献域。

之后在 Word 里就能像平时一样用 EndNote 面板：

- **Update Citations and Bibliography**：在 EndNote 里换 Output Style、增删文献、调整顺序后重新排版；
- **Edit & Manage Citation(s)**：给某条引用加页码、前缀，或删掉它；
- 右键 → *Edit Library Reference* 直接跳到 EndNote 里的该条记录。

注意事项：

- 需要桌面版 Word + 装了 Cite While You Write 加载项的 EndNote；插件会隐藏运行，
  如果是插件启动的这些程序，结束后会自动关掉。
- EndNote 必须**打开的是同一个文献库**——记录号是在 EndNote 里解析的。没打开的话，
  桥接脚本会用你设置的库路径启动 EndNote。
- EndNote 会扫描全文里所有 `{...}`。如果笔记正文里有形如 `{作者, #12}` 的文字，
  EndNote 可能停下来等你选文献，此时导出会超时并给出提示。
- 参考文献表由 EndNote 追加在全文末尾，标题沿用笔记末尾的「参考文献 / References」
  小标题（没有就自动加一个）。



## 文献库侧边栏

点左侧 ribbon 的**书本图标**（或命令面板搜「打开文献库侧边栏」），右侧会打开一个面板：

- **搜索**：作者、标题、年份、期刊、引用键都能搜，按相关度排序。回车 = 插入第一条，Esc = 清空。
- **分组**：只占一行「全部文献 108 ▾」，点一下在下方悬浮展开全部分组（条数右对齐，当前分组高亮）。
  点分组 = 只看该组；点别处或按 Esc 收起。数据取自 EndNote 库的 `groups` 表。
- **每行右边的 `+`**：把 `[@引用键]` 插到你刚才编辑的那篇笔记的光标处；如果光标已经在
  某个 `[...]` 里，会自动写成 `; @键` 追加，不会破坏原来的括号。
- **点行本身**：展开详情（引用键、卷期页、DOI、文献类型、摘要），还有「复制引用键」按钮；再点这一行
  的任何位置就收起。整行都是点击区，键盘 `Enter` 也能开关，侧栏再窄也点得到。
- 当前笔记里已经引用过的文献，行首会带 ✓，标题变灰，避免重复插入。

在 EndNote 里保存文献后，侧边栏会在几秒内自动跟着更新。

## 样式说明

EndNote 的 `.ens` 是私有格式，无法直接解析，所以插件读取 EndNote 当前选中样式的
**名字**（Windows 注册表 `HKCU\Software\ISI ResearchSoft\EndNote`），再映射到最接近的
内置 CSL 样式。内置：Harvard (Cite Them Right)、Nature、APA、Chicago、
GB/T 7714-2015（顺序编码制 / 著者-出版年制）、IEEE、AMA、Elsevier Vancouver、Springer Basic。
其它样式请从 <https://zotero.org/styles> 下载 `.csl`，在设置里指定路径。

## 原理

```
.enl (SQLite) ──sql.js──▶ 文献记录 ──▶ CSL-JSON ──▶ citeproc-js ──▶ 编辑器预览
                                                └─▶ pandoc --citeproc ─▶ .docx
                                                └─▶ BibTeX ────────────▶ .tex + .bib
```

预览和导出用的是同一个 CSL 样式文件，所以写的时候看到的引用格式，就是导出后的格式。

## 开发

```bash
npm install
npm run build     # tsc + esbuild → main.js
npm test          # 无界面端到端测试（需要 pandoc；涉及 Word/EndNote 的用例会跳过）
```

发版只要打一个标签：改好 `manifest.json`、`package.json`、`versions.json` 的版本号，
提交后 `git push origin v0.3.4`。`.github/workflows/release.yml` 会自动构建、连带
`bridge/` 一起打包成 zip、生成 `SHA256SUMS.txt` 并发布 GitHub Release。发布说明优先用
`docs/release-notes/v<版本>.md`（英文正文 + 可折叠中文说明），没有这个文件就按上个标签
以来的提交自动生成。

## 许可

插件自身的源码是 MIT —— 见 [`LICENSE`](LICENSE)。

`main.js` 里还打包了第三方组件，它们各自保留原有许可：

| 组件 | 许可 | 用途 |
|---|---|---|
| [citeproc-js](https://github.com/Juris-M/citeproc-js) 2.4.63 | CPAL-1.0 或 AGPL-1.0 | CSL 引用处理器（原样打包，未修改；源码见链接和包的 `node_modules/citeproc`） |
| [sql.js](https://github.com/sql-js/sql.js) 1.16.0 | MIT | 编译成 WebAssembly 的 SQLite，用来读 `.enl` 库 |
| SQLite | 公有领域 | 在 sql.js 内部 |
| [CSL 样式与语言包](https://github.com/citation-style-language/styles) | CC BY-SA 3.0 | Harvard (Cite Them Right)、APA、Chicago、Nature、IEEE、AMA、Elsevier Vancouver、Springer、GB/T 7714-2015（顺序编码制与著者-出版年制） |