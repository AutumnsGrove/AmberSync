export interface RemoteFileEntry {
  path: string;
  contentHash: string;
  sizeBytes: number;
  updatedAt: string;
  updatedBy: string;
  deleted: boolean;
}

export interface SyncTransport {
  getManifest(): Promise<RemoteFileEntry[]>;
  getChangesSince(timestamp: string): Promise<RemoteFileEntry[]>;
  uploadFile(path: string, data: ArrayBuffer, deviceId: string): Promise<void>;
  downloadFile(path: string): Promise<ArrayBuffer>;
  deleteFile(path: string, deviceId: string): Promise<void>;
}

export class WorkerTransport implements SyncTransport {
  constructor(
    private workerUrl: string,
    private apiKey: string,
    private deviceId: string,
  ) {}

  private headers(): Record<string, string> {
    return {
      "X-Sync-Key": this.apiKey,
      "X-Device-Id": this.deviceId,
    };
  }

  async getManifest(): Promise<RemoteFileEntry[]> {
    const res = await fetch(`${this.workerUrl}/manifest`, {
      headers: this.headers(),
    });
    if (!res.ok) throw new Error(`Manifest fetch failed: ${res.status}`);
    return res.json();
  }

  async getChangesSince(timestamp: string): Promise<RemoteFileEntry[]> {
    const res = await fetch(
      `${this.workerUrl}/manifest/since/${encodeURIComponent(timestamp)}`,
      { headers: this.headers() },
    );
    if (!res.ok) throw new Error(`Incremental manifest failed: ${res.status}`);
    return res.json();
  }

  async uploadFile(
    path: string,
    data: ArrayBuffer,
    _deviceId: string,
  ): Promise<void> {
    const res = await fetch(
      `${this.workerUrl}/files/${encodeURIComponent(path)}`,
      {
        method: "PUT",
        headers: {
          ...this.headers(),
          "Content-Type": "application/octet-stream",
        },
        body: data,
      },
    );
    if (!res.ok) throw new Error(`Upload failed: ${path}: ${res.status}`);
  }

  async downloadFile(path: string): Promise<ArrayBuffer> {
    const res = await fetch(
      `${this.workerUrl}/files/${encodeURIComponent(path)}`,
      { headers: this.headers() },
    );
    if (!res.ok) throw new Error(`Download failed: ${path}: ${res.status}`);
    return res.arrayBuffer();
  }

  async deleteFile(path: string, _deviceId: string): Promise<void> {
    const res = await fetch(
      `${this.workerUrl}/files/${encodeURIComponent(path)}`,
      {
        method: "DELETE",
        headers: this.headers(),
      },
    );
    if (!res.ok) throw new Error(`Delete failed: ${path}: ${res.status}`);
  }
}
