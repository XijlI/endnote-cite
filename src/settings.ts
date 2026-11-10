import { App, Notice, PluginSettingTab, Setting } from "obsidian";
import type EndNoteCitePlugin from "./main";
import { STYLE_PRESETS } from "./styles-registry";
import { t, type LangSetting } from "./i18n";

export interface EndNoteCiteSettings {
  /** UI language: English by default, Chinese on request, or follow Obsidian. */
  language: LangSetting;
  /** Absolute path to the .enl library. */
  libraryPath: string;
  /** Bundled style id, or "custom" when stylePath is used. */
  styleId: string;
  /** Absolute path to a custom .csl file. */
  stylePath: string;
  /** Read the output style EndNote has selected and use the closest CSL match. */
  followEndNoteStyle: boolean;
  /** pandoc executable. */
  pandocPath: string;
  /** Optional explicit path to EndNote.exe (auto-detected when empty). */
  endNoteExe: string;
  /** Optional .docx used as pandoc's --reference-doc (fonts, margins). */
  wordTemplate: string;
  /** Folder (vault-relative) for exports; empty = next to the note. */
  exportFolder: string;
  /** Heading used above the generated bibliography. */
  bibTitle: string;
  /** Show rendered citations inline while editing. */
  livePreview: boolean;
  /** refId -> pinned citation key. */
  keyOverrides: Record<string, string>;
}

export const DEFAULT_SETTINGS: EndNoteCiteSettings = {
  language: "en",
  libraryPath: "",
  styleId: "harvard-cite-them-right",
  stylePath: "",
  followEndNoteStyle: true,
  pandocPath: "pandoc",
  endNoteExe: "",
  wordTemplate: "",
  exportFolder: "",
  bibTitle: "References",
  livePreview: true,
  keyOverrides: {},
};

export class EndNoteCiteSettingTab extends PluginSettingTab {
  plugin: EndNoteCitePlugin;

  constructor(app: App, plugin: EndNoteCitePlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    // ── language ────────────────────────────────────────────
    new Setting(containerEl).setName(t("set.lang.heading")).setHeading();
    new Setting(containerEl)
      .setName(t("set.lang.name"))
      .setDesc(t("set.lang.desc"))
      .addDropdown((d) => {
        d.addOption("en", t("set.lang.en"));
        d.addOption("zh", t("set.lang.zh"));
        d.addOption("auto", t("set.lang.auto"));
        d.setValue(this.plugin.settings.language).onChange(async (v) => {
          this.plugin.settings.language = v as LangSetting;
          await this.plugin.saveSettings();
          this.plugin.applyLanguage();
          this.display();
        });
      });

    // ── library ─────────────────────────────────────────────
    new Setting(containerEl).setName(t("set.library.heading")).setHeading();

    new Setting(containerEl)
      .setName(t("set.path.name"))
      .setDesc(t("set.path.desc"))
      .addText((text) =>
        text
          .setPlaceholder("C:\\Users\\me\\Documents\\My EndNote Library.enl")
          .setValue(this.plugin.settings.libraryPath)
          .onChange(async (v) => {
            this.plugin.settings.libraryPath = v.trim();
            await this.plugin.saveSettings();
            await this.plugin.reloadLibrary(true);
          })
      )
      .addButton((b) =>
        b.setButtonText(t("set.path.reload")).onClick(async () => {
          await this.plugin.reloadLibrary(true);
        })
      );

    containerEl.createDiv({
      cls: "en-status",
      text: this.plugin.statusLine(),
    });

    // ── style ───────────────────────────────────────────────
    new Setting(containerEl).setName(t("set.style.heading")).setHeading();

    new Setting(containerEl)
      .setName(t("set.follow.name"))
      .setDesc(t("set.follow.desc"))
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.followEndNoteStyle).onChange(async (v) => {
          this.plugin.settings.followEndNoteStyle = v;
          await this.plugin.saveSettings();
          this.plugin.refreshStyle();
          this.display();
        })
      );

    if (this.plugin.settings.followEndNoteStyle && this.plugin.endNoteStyleName) {
      containerEl.createDiv({
        cls: "en-status",
        text: t("set.follow.status", {
          name: this.plugin.endNoteStyleName,
          match: this.plugin.styleLabel(),
        }),
      });
    }

    new Setting(containerEl)
      .setName(t("set.csl.name"))
      .setDesc(t("set.csl.desc"))
      .addDropdown((d) => {
        for (const preset of STYLE_PRESETS) d.addOption(preset.id, preset.label);
        d.addOption("custom", t("set.csl.custom"));
        d.setValue(this.plugin.settings.styleId).onChange(async (v) => {
          this.plugin.settings.styleId = v;
          await this.plugin.saveSettings();
          this.plugin.refreshStyle();
          this.display();
        });
      });

    new Setting(containerEl)
      .setName(t("set.customCsl.name"))
      .setDesc(t("set.customCsl.desc"))
      .addText((text) =>
        text
          .setPlaceholder("C:\\Users\\me\\Downloads\\nature.csl")
          .setValue(this.plugin.settings.stylePath)
          .onChange(async (v) => {
            this.plugin.settings.stylePath = v.trim();
            await this.plugin.saveSettings();
            this.plugin.refreshStyle();
          })
      );

    // ── writing ─────────────────────────────────────────────
    new Setting(containerEl).setName(t("set.writing.heading")).setHeading();

    new Setting(containerEl)
      .setName(t("set.livePreview.name"))
      .setDesc(t("set.livePreview.desc"))
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.livePreview).onChange(async (v) => {
          this.plugin.settings.livePreview = v;
          await this.plugin.saveSettings();
          this.plugin.refreshEditors();
        })
      );

    new Setting(containerEl)
      .setName(t("set.bibTitle.name"))
      .setDesc(t("set.bibTitle.desc"))
      .addText((text) =>
        text.setValue(this.plugin.settings.bibTitle).onChange(async (v) => {
          this.plugin.settings.bibTitle = v;
          await this.plugin.saveSettings();
        })
      );

    // ── export ──────────────────────────────────────────────
    new Setting(containerEl).setName(t("set.export.heading")).setHeading();

    new Setting(containerEl)
      .setName(t("set.pandoc.name"))
      .setDesc(t("set.pandoc.desc"))
      .addText((text) =>
        text
          .setPlaceholder("C:\\Program Files\\Pandoc\\pandoc.exe")
          .setValue(this.plugin.settings.pandocPath)
          .onChange(async (v) => {
            this.plugin.settings.pandocPath = v.trim() || "pandoc";
            await this.plugin.saveSettings();
          })
      )
      .addButton((b) =>
        b.setButtonText(t("set.pandoc.check")).onClick(async () => {
          const v = await this.plugin.checkPandoc();
          new Notice(v ? t("set.pandoc.ok", { v }) : t("set.pandoc.bad"));
        })
      );

    new Setting(containerEl)
      .setName(t("set.template.name"))
      .setDesc(t("set.template.desc"))
      .addText((text) =>
        text
          .setPlaceholder("C:\\Users\\me\\Documents\\my-template.docx")
          .setValue(this.plugin.settings.wordTemplate)
          .onChange(async (v) => {
            this.plugin.settings.wordTemplate = v.trim();
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName(t("set.folder.name"))
      .setDesc(t("set.folder.desc"))
      .addText((text) =>
        text
          .setPlaceholder("Exports")
          .setValue(this.plugin.settings.exportFolder)
          .onChange(async (v) => {
            this.plugin.settings.exportFolder = v.trim();
            await this.plugin.saveSettings();
          })
      );

    containerEl.createEl("p", { cls: "en-hint", text: t("set.usage") });

    // ── EndNote field export ────────────────────────────────
    new Setting(containerEl).setName(t("set.fields.heading")).setHeading();
    containerEl.createEl("p", { cls: "en-hint", text: t("set.fields.desc") });

    new Setting(containerEl)
      .setName(t("set.endnoteExe.name"))
      .setDesc(t("set.endnoteExe.desc"))
      .addText((text) =>
        text
          .setPlaceholder("C:\\Program Files (x86)\\EndNote 2025\\EndNote.exe")
          .setValue(this.plugin.settings.endNoteExe)
          .onChange(async (v) => {
            this.plugin.settings.endNoteExe = v.trim();
            await this.plugin.saveSettings();
          })
      );
  }
}
