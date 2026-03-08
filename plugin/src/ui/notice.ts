import { Notice } from "obsidian";

export function notifySyncResult(uploaded: number, downloaded: number) {
  new Notice(`Amber: \u2191${uploaded} \u2193${downloaded}`);
}

export function notifyConflicts(count: number) {
  new Notice(
    `Amber Sync: ${count} conflict(s) created \u2014 look for .conflict files`,
  );
}

export function notifyError(message: string) {
  new Notice(`Amber Sync error: ${message}`);
}

export function notifyConfigNeeded() {
  new Notice("Amber Sync: configure Worker URL and API key in settings");
}
