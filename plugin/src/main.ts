import { Plugin } from "obsidian";
import {
  AmberSyncSettingsTab,
  DEFAULT_SETTINGS,
  type AmberSyncSettings,
} from "./settings";
import { WorkerTransport } from "./sync/transport";
import { sync } from "./sync/engine";
import { SyncStatusBar } from "./ui/status-bar";
import {
  notifyConfigNeeded,
  notifyConflicts,
  notifyError,
  notifySyncResult,
} from "./ui/notice";

export default class AmberSyncPlugin extends Plugin {
  settings: AmberSyncSettings = DEFAULT_SETTINGS;
  private statusBar!: SyncStatusBar;
  private syncing = false;

  async onload() {
    await this.loadSettings();

    // Ribbon icon — manual sync trigger
    this.addRibbonIcon("refresh-cw", "Amber Sync", () => this.runSync());

    // Command palette
    this.addCommand({
      id: "amber-sync-now",
      name: "Sync now",
      callback: () => this.runSync(),
    });

    // Status bar
    this.statusBar = new SyncStatusBar(this.addStatusBarItem());

    // Sync on startup (small delay for vault to fully load)
    if (this.settings.syncOnStartup && this.settings.workerUrl) {
      setTimeout(() => this.runSync(), 3000);
    }

    // Auto sync interval
    if (this.settings.autoSyncMinutes > 0) {
      this.registerInterval(
        window.setInterval(
          () => this.runSync(),
          this.settings.autoSyncMinutes * 60 * 1000,
        ),
      );
    }

    // Settings tab
    this.addSettingTab(new AmberSyncSettingsTab(this.app, this));
  }

  async runSync() {
    if (!this.settings.workerUrl || !this.settings.apiKey) {
      notifyConfigNeeded();
      return;
    }

    if (this.syncing) return;
    this.syncing = true;
    this.statusBar.setSyncing();

    const transport = new WorkerTransport(
      this.settings.workerUrl,
      this.settings.apiKey,
      this.settings.deviceId,
    );

    try {
      const result = await sync(
        this.app.vault,
        transport,
        this.settings.deviceId,
        this.settings.excludes,
      );

      this.statusBar.setSynced(result.uploaded, result.downloaded);
      notifySyncResult(result.uploaded, result.downloaded);

      if (result.conflicts > 0) {
        notifyConflicts(result.conflicts);
      }

      if (result.errors.length > 0) {
        console.warn("[amber-sync] Sync completed with errors:", result.errors);
      }

      console.log(
        `[amber-sync] Sync complete: ↑${result.uploaded} ↓${result.downloaded} ⚡${result.conflicts} 🗑${result.deleted}`,
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.statusBar.setError(message);
      notifyError(message);
      console.error("[amber-sync]", err);
    } finally {
      this.syncing = false;
    }
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}
