/**
 * Minimal stand-in for the `obsidian` module so the plugin can be exercised in
 * plain Node: enough surface to run onload() and the export pipeline for real.
 */

export class Notice {
  constructor(public message: string, public timeout?: number) {
    console.log("[Notice]", message);
  }
}

export class Component {
  registerEvent() {}
  registerInterval() {}
  addChild() {}
}

export class Plugin extends Component {
  app: any;
  manifest: any = { id: "endnote-cite", dir: process.cwd(), version: "0.1.0" };
  constructor(app: any) {
    super();
    this.app = app;
  }
  async loadData() {
    return (global as any).__pluginData ?? {};
  }
  async saveData(d: any) {
    (global as any).__pluginData = d;
  }
  addSettingTab() {}
  registerEditorExtension() {}
  registerEditorSuggest() {}
  registerMarkdownPostProcessor() {}
  registerMarkdownCodeBlockProcessor() {}
  addCommand(cmd: any) {
    ((global as any).__commands ??= []).push(cmd);
  }
  registerView(type: string, factory: any) {
    ((global as any).__views ??= {})[type] = factory;
  }
  addRibbonIcon() {
    return { addClass() {} };
  }
}

export class PluginSettingTab {
  containerEl: any = { empty() {}, createDiv: () => ({ createDiv: () => ({}) }) };
  constructor(public app: any, public plugin: any) {}
}

class FakeEl {
  children: FakeEl[] = [];
  listeners: Record<string, ((ev: any) => void)[]> = {};
  value = "";
  textContent = "";
  focused = false;
  constructor(public cls?: string, public text?: string) {
    if (text) this.textContent = text;
  }
  empty() {
    this.children = [];
    this.textContent = "";
  }
  createDiv(o?: any) {
    const el = new FakeEl(o?.cls, o?.text);
    this.children.push(el);
    return el;
  }
  createEl(tag: string, o?: any) {
    const el = new FakeEl(o?.cls, o?.text);
    el.tag = tag;
    this.children.push(el);
    return el;
  }
  createSpan(o?: any) {
    return this.createDiv(o);
  }
  tag = "div";
  addClass(c: string) {
    this.cls = `${this.cls ?? ""} ${c}`.trim();
  }
  removeClass(c: string) {
    this.cls = (this.cls ?? "")
      .split(/\s+/)
      .filter((x) => x !== c)
      .join(" ");
  }
  toggleClass(c: string, on: boolean) {
    if (on) this.addClass(c);
    else this.removeClass(c);
  }
  hasClass(c: string) {
    return (this.cls ?? "").split(/\s+/).includes(c);
  }
  setAttribute() {}
  setText(t: string) {
    this.textContent = t;
    this.text = t;
  }
  focus() {
    this.focused = true;
  }
  addEventListener(type: string, fn: (ev: any) => void) {
    (this.listeners[type] ??= []).push(fn);
  }
  emit(type: string, ev: any = {}) {
    ev.stopPropagation ??= () => {};
    ev.preventDefault ??= () => {};
    for (const fn of this.listeners[type] ?? []) fn(ev);
  }
  appendChild() {}
  /** All descendants carrying the given class. */
  findAll(cls: string): FakeEl[] {
    const out: FakeEl[] = [];
    const walk = (el: FakeEl) => {
      if (el.hasClass(cls)) out.push(el);
      el.children.forEach(walk);
    };
    walk(this);
    return out;
  }
  find(cls: string): FakeEl | null {
    return this.findAll(cls)[0] ?? null;
  }
  /** Concatenated text of the subtree, for assertions. */
  dump(): string {
    return [this.textContent, ...this.children.map((c) => c.dump())].filter(Boolean).join(" | ");
  }
}

export class Setting {
  constructor(el: any) {}
  setName() {
    return this;
  }
  setDesc() {
    return this;
  }
  setHeading() {
    return this;
  }
  addText(cb?: any) {
    cb?.({ setPlaceholder() { return this; }, setValue() { return this; }, onChange() { return this; } });
    return this;
  }
  addToggle(cb?: any) {
    cb?.({ setValue() { return this; }, onChange() { return this; } });
    return this;
  }
  addDropdown(cb?: any) {
    cb?.({ addOption() { return this; }, setValue() { return this; }, onChange() { return this; } });
    return this;
  }
  addButton(cb?: any) {
    cb?.({ setButtonText() { return this; }, onClick() { return this; } });
    return this;
  }
}

export class TFile {
  extension = "md";
  basename: string;
  path: string;
  parent: { path: string } | null;
  constructor(path: string) {
    this.path = path;
    this.basename = path.replace(/^.*\//, "").replace(/\.[^.]+$/, "");
    const dir = path.replace(/\/?[^/]*$/, "");
    this.parent = dir ? { path: dir } : null;
  }
}

export class Modal {
  app: any;
  contentEl = new FakeEl();
  constructor(app: any) {
    this.app = app;
  }
  open() {}
  close() {}
}

export class EditorSuggest {
  constructor(public app: any) {}
}

export class MarkdownView {}
export class FileSystemAdapter {}
export class Editor {}
export class MarkdownRenderer {}

export class WorkspaceLeaf {
  view: any = null;
  constructor(public app?: any) {}
}

export class ItemView extends Component {
  app: any;
  containerEl: any;
  contentEl: any;
  constructor(public leaf: WorkspaceLeaf) {
    super();
    this.app = leaf?.app;
    this.containerEl = new FakeEl();
    this.contentEl = this.containerEl.createDiv();
  }
  getViewType() {
    return "item";
  }
  getDisplayText() {
    return "";
  }
  getIcon() {
    return "";
  }
}

export function setIcon() {}

// The plugin only ever writes through these; both are no-ops in Node.
export const Platform = { isMobile: false, isDesktop: true, isDesktopApp: true };

export function normalizePath(p: string): string {
  return p.replace(/\\/g, "/").replace(/\/+/g, "/").replace(/^\/|\/$/g, "");
}
