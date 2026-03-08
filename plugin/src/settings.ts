import { App, PluginSettingTab, Setting } from "obsidian";
import type AmberSyncPlugin from "./main";

export interface AmberSyncSettings {
  workerUrl: string;
  apiKey: string;
  deviceId: string;
  deviceName: string;
  syncOnStartup: boolean;
  autoSyncMinutes: number;
  excludes: string[];
}

export const DEFAULT_SETTINGS: AmberSyncSettings = {
  workerUrl: "",
  apiKey: "",
  deviceId: crypto.randomUUID(),
  deviceName: "",
  syncOnStartup: true,
  autoSyncMinutes: 5,
  excludes: [
    ".obsidian/workspace.json",
    ".obsidian/workspace-mobile.json",
    ".obsidian/cache/**",
    ".obsidian/plugins/amber-sync/data.json",
    ".trash/**",
  ],
};

export class AmberSyncSettingsTab extends PluginSettingTab {
  plugin: AmberSyncPlugin;

  constructor(app: App, plugin: AmberSyncPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl("h2", { text: "Amber Sync Settings" });

    new Setting(containerEl)
      .setName("Worker URL")
      .setDesc(
        "Your Cloudflare Worker URL (e.g. https://amber-sync.you.workers.dev)",
      )
      .addText((text) =>
        text
          .setPlaceholder("https://amber-sync.example.workers.dev")
          .setValue(this.plugin.settings.workerUrl)
          .onChange(async (value) => {
            this.plugin.settings.workerUrl = value.trim();
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("API Key")
      .setDesc("The sync API key set on your Worker")
      .addText((text) =>
        text
          .setPlaceholder("your-api-key")
          .setValue(this.plugin.settings.apiKey)
          .onChange(async (value) => {
            this.plugin.settings.apiKey = value.trim();
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Device Name")
      .setDesc("Human-readable name for this device (e.g. iPad Pro, Mac Mini)")
      .addText((text) =>
        text
          .setPlaceholder("My Device")
          .setValue(this.plugin.settings.deviceName)
          .onChange(async (value) => {
            this.plugin.settings.deviceName = value.trim();
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Device ID")
      .setDesc("Unique identifier for this device (auto-generated)")
      .addText((text) =>
        text.setValue(this.plugin.settings.deviceId).setDisabled(true),
      );

    new Setting(containerEl)
      .setName("Sync on Startup")
      .setDesc("Automatically sync when Obsidian opens")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.syncOnStartup)
          .onChange(async (value) => {
            this.plugin.settings.syncOnStartup = value;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Auto Sync Interval (minutes)")
      .setDesc("How often to sync automatically. Set 0 for manual only.")
      .addText((text) =>
        text
          .setValue(String(this.plugin.settings.autoSyncMinutes))
          .onChange(async (value) => {
            const num = parseInt(value, 10);
            if (!isNaN(num) && num >= 0) {
              this.plugin.settings.autoSyncMinutes = num;
              await this.plugin.saveSettings();
            }
          }),
      );

    new Setting(containerEl)
      .setName("Excluded Paths")
      .setDesc("Paths to exclude from sync (one per line). Supports ** globs.")
      .addTextArea((text) =>
        text
          .setPlaceholder(".obsidian/workspace.json\n.trash/**")
          .setValue(this.plugin.settings.excludes.join("\n"))
          .onChange(async (value) => {
            this.plugin.settings.excludes = value
              .split("\n")
              .map((s) => s.trim())
              .filter((s) => s.length > 0);
            await this.plugin.saveSettings();
          }),
      );
  }
}
