export class SyncStatusBar {
  constructor(private el: HTMLElement) {
    this.setReady();
  }

  setReady() {
    this.el.setText("Amber: ready");
  }

  setSyncing() {
    this.el.setText("Amber: syncing...");
  }

  setSynced(uploaded: number, downloaded: number) {
    const now = new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
    this.el.setText(
      `Amber: synced ${now} \u2191${uploaded} \u2193${downloaded}`,
    );
  }

  setError(message: string) {
    this.el.setText(`Amber: error \u2014 ${message}`);
  }
}
