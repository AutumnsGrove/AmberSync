import type { Vault, TFile } from "obsidian";
import type { SyncTransport } from "./transport";
import type { LocalEntry } from "./snapshot";
import { loadSnapshot, saveSnapshot } from "./snapshot";
import { diff } from "./differ";
import { md5 } from "./hasher";

export interface SyncResult {
  uploaded: number;
  downloaded: number;
  conflicts: number;
  deleted: number;
  errors: string[];
}

export async function sync(
  vault: Vault,
  transport: SyncTransport,
  deviceId: string,
  excludes: string[],
): Promise<SyncResult> {
  const errors: string[] = [];

  // 1. Get remote manifest from Worker (D1)
  const remoteFiles = await transport.getManifest();
  const remoteMap = new Map(remoteFiles.map((f) => [f.path, f]));

  // 2. Scan local vault + hash every file
  const localMap = new Map<string, LocalEntry>();
  for (const file of vault.getFiles()) {
    if (isExcluded(file.path, excludes)) continue;
    try {
      const data = await vault.readBinary(file);
      const hash = await md5(data);
      localMap.set(file.path, {
        hash,
        mtime: file.stat.mtime,
        size: file.stat.size,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`Failed to read ${file.path}: ${msg}`);
    }
  }

  // 3. Load last sync snapshot
  const snapshot = await loadSnapshot(vault);

  // 4. Three-way diff
  const actions = diff(localMap, remoteMap, snapshot);

  // 5. Execute in safe order

  //    a. Downloads first (get latest from other devices)
  for (const dl of actions.downloads) {
    try {
      const data = await transport.downloadFile(dl.path);
      // Ensure parent directories exist
      const dir = dl.path.substring(0, dl.path.lastIndexOf("/"));
      if (dir && !vault.getAbstractFileByPath(dir)) {
        await vault.createFolder(dir);
      }
      await vault.adapter.writeBinary(dl.path, new Uint8Array(data));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`Download failed: ${dl.path}: ${msg}`);
    }
  }

  //    b. Conflict copies (preserve BOTH versions, then resolve)
  for (const conflict of actions.conflicts) {
    try {
      const loser = conflict.localNewer ? "remote" : "local";

      if (loser === "local") {
        // Local is older → save local as conflict copy, download remote winner
        const localFile = vault.getAbstractFileByPath(conflict.path);
        if (localFile) {
          const localData = await vault.readBinary(localFile as TFile);
          const conflictPath = makeConflictPath(conflict.path, deviceId);
          await vault.adapter.writeBinary(
            conflictPath,
            new Uint8Array(localData),
          );
        }
        const remoteData = await transport.downloadFile(conflict.path);
        await vault.adapter.writeBinary(
          conflict.path,
          new Uint8Array(remoteData),
        );
      } else {
        // Remote is older → save remote as conflict copy, upload local winner
        const remoteData = await transport.downloadFile(conflict.path);
        const conflictPath = makeConflictPath(
          conflict.path,
          conflict.remoteDeviceId,
        );
        await vault.adapter.writeBinary(
          conflictPath,
          new Uint8Array(remoteData),
        );
        const localFile = vault.getAbstractFileByPath(conflict.path);
        if (localFile) {
          const localData = await vault.readBinary(localFile as TFile);
          await transport.uploadFile(conflict.path, localData, deviceId);
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`Conflict resolution failed: ${conflict.path}: ${msg}`);
    }
  }

  //    c. Uploads (push local changes)
  for (const ul of actions.uploads) {
    try {
      const file = vault.getAbstractFileByPath(ul.path);
      if (file) {
        const data = await vault.readBinary(file as TFile);
        await transport.uploadFile(ul.path, data, deviceId);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`Upload failed: ${ul.path}: ${msg}`);
    }
  }

  //    d. Deletes
  for (const del of actions.localDeletes) {
    try {
      const file = vault.getAbstractFileByPath(del.path);
      if (file) await vault.delete(file as TFile);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`Local delete failed: ${del.path}: ${msg}`);
    }
  }
  for (const del of actions.remoteDeletes) {
    try {
      await transport.deleteFile(del.path, deviceId);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`Remote delete failed: ${del.path}: ${msg}`);
    }
  }

  // 6. Re-scan and save updated snapshot
  const updatedRemote = await transport.getManifest();
  const updatedRemoteMap = new Map(updatedRemote.map((f) => [f.path, f]));

  const updatedLocalMap = new Map<string, LocalEntry>();
  for (const file of vault.getFiles()) {
    if (isExcluded(file.path, excludes)) continue;
    try {
      const data = await vault.readBinary(file);
      const hash = await md5(data);
      updatedLocalMap.set(file.path, {
        hash,
        mtime: file.stat.mtime,
        size: file.stat.size,
      });
    } catch {
      /* skip */
    }
  }

  await saveSnapshot(vault, updatedLocalMap, updatedRemoteMap);

  return {
    uploaded: actions.uploads.length,
    downloaded: actions.downloads.length,
    conflicts: actions.conflicts.length,
    deleted: actions.localDeletes.length + actions.remoteDeletes.length,
    errors,
  };
}

function makeConflictPath(path: string, sourceId: string): string {
  const dot = path.lastIndexOf(".");
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  if (dot > -1) {
    return `${path.slice(0, dot)}.conflict-${sourceId}-${timestamp}${path.slice(dot)}`;
  }
  return `${path}.conflict-${sourceId}-${timestamp}`;
}

function isExcluded(path: string, excludes: string[]): boolean {
  return excludes.some((pattern) => {
    if (pattern.endsWith("/**")) {
      return path.startsWith(pattern.slice(0, -3));
    }
    return path === pattern || path.startsWith(pattern + "/");
  });
}
