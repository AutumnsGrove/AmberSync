import type { Vault } from "obsidian";
import type { RemoteFileEntry } from "./transport";

export interface SnapshotEntry {
  localHash: string;
  remoteHash: string;
  mtime: number;
}

export type SyncSnapshot = Record<string, SnapshotEntry>;

export interface LocalEntry {
  hash: string;
  mtime: number;
  size: number;
}

const SNAPSHOT_PATH = ".obsidian/plugins/amber-sync/snapshot.json";

export async function loadSnapshot(vault: Vault): Promise<SyncSnapshot> {
  try {
    const raw = await vault.adapter.read(SNAPSHOT_PATH);
    return JSON.parse(raw) as SyncSnapshot;
  } catch {
    return {};
  }
}

export async function saveSnapshot(
  vault: Vault,
  localMap: Map<string, LocalEntry>,
  remoteMap: Map<string, RemoteFileEntry>,
): Promise<void> {
  const snapshot: SyncSnapshot = {};

  const allPaths = new Set([...localMap.keys(), ...remoteMap.keys()]);

  for (const path of allPaths) {
    const l = localMap.get(path);
    const r = remoteMap.get(path);
    if (r?.deleted) continue;

    snapshot[path] = {
      localHash: l?.hash ?? "",
      remoteHash: r?.contentHash ?? "",
      mtime: l?.mtime ?? 0,
    };
  }

  await vault.adapter.write(SNAPSHOT_PATH, JSON.stringify(snapshot));
}
