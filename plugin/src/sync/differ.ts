import type { RemoteFileEntry } from "./transport";
import type { LocalEntry, SyncSnapshot } from "./snapshot";

export interface SyncActions {
  uploads: { path: string }[];
  downloads: { path: string }[];
  conflicts: {
    path: string;
    localNewer: boolean;
    remoteDeviceId: string;
  }[];
  localDeletes: { path: string }[];
  remoteDeletes: { path: string }[];
}

export function diff(
  local: Map<string, LocalEntry>,
  remote: Map<string, RemoteFileEntry>,
  snapshot: SyncSnapshot,
): SyncActions {
  const actions: SyncActions = {
    uploads: [],
    downloads: [],
    conflicts: [],
    localDeletes: [],
    remoteDeletes: [],
  };

  const allPaths = new Set([
    ...local.keys(),
    ...remote.keys(),
    ...Object.keys(snapshot),
  ]);

  for (const path of allPaths) {
    const l = local.get(path);
    const r = remote.get(path);
    const s = snapshot[path];

    const localExists = !!l;
    const remoteExists = !!r && !r.deleted;
    const wasInSnapshot = !!s;

    const localChanged = l && s ? l.hash !== s.localHash : false;
    const remoteChanged = r && s ? r.contentHash !== s.remoteHash : false;

    // Both exist
    if (localExists && remoteExists) {
      if (l.hash === r!.contentHash) continue; // identical

      if (localChanged && remoteChanged) {
        actions.conflicts.push({
          path,
          localNewer: l.mtime > new Date(r!.updatedAt).getTime(),
          remoteDeviceId: r!.updatedBy,
        });
      } else if (localChanged) {
        actions.uploads.push({ path });
      } else if (remoteChanged) {
        actions.downloads.push({ path });
      } else {
        // Hashes differ but neither flagged as changed vs snapshot
        // (edge case: snapshot was stale). Download remote as tiebreaker.
        actions.downloads.push({ path });
      }
    }

    // New file (no snapshot entry)
    else if (localExists && !remoteExists && !wasInSnapshot) {
      actions.uploads.push({ path });
    } else if (!localExists && remoteExists && !wasInSnapshot) {
      actions.downloads.push({ path });
    }

    // Deletion detection (was in snapshot)
    else if (localExists && !remoteExists && wasInSnapshot) {
      // Was synced before, now gone from remote → another device deleted it
      actions.localDeletes.push({ path });
    } else if (!localExists && remoteExists && wasInSnapshot) {
      // Was synced before, now gone locally → we deleted it
      actions.remoteDeletes.push({ path });
    }
  }

  return actions;
}
