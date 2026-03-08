---
title: "Amber Sync — MVP Specification"
description: "Personal Obsidian vault sync via Cloudflare Worker + R2. Weekend sprint, designed for productization."
category: specs
specCategory: platform-services
icon: refresh-cw
date created: Saturday, March 8th 2026
tags:
  - amber-sync
  - obsidian
  - cloudflare-r2
  - sync
  - weekend-sprint
type: tech-spec
status: active
---

# Amber Sync — MVP Specification

> _Your vault. Your infrastructure. Your sync. $0/month._

Amber Sync is a personal Obsidian vault synchronization system built on Cloudflare Workers, D1, and R2. It replaces Obsidian Sync ($10/month) with a self-hosted solution that costs effectively nothing on R2's free tier.

**Scope:** Personal use only. One user (Autumn), one vault, three Apple devices (Mac Mini, iPad Pro, iPhone). Designed with a clean transport abstraction so it can be productized as a Grove service later.

---

## Architecture

Two halves: a Cloudflare Worker (the brain) and an Obsidian plugin (the client).

```
┌─────────────────────────────────────────────────────────────┐
│                    OBSIDIAN PLUGIN                            │
│            (Mac Mini, iPad Pro, iPhone)                       │
│                                                              │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌─────────────┐  │
│  │  Sync    │  │  Differ  │  │Transport │  │  Settings   │  │
│  │  Engine  │──│  (3-way) │──│Interface │──│  + Status   │  │
│  └──────────┘  └──────────┘  └────┬─────┘  └─────────────┘  │
└───────────────────────────────────┼──────────────────────────┘
                                    │ HTTPS
                                    ▼
┌───────────────────────────────────────────────────────────────┐
│                 AMBER SYNC WORKER                              │
│                 (Cloudflare Worker + Hono)                     │
│                                                               │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────┐  │
│  │   Auth   │  │ Manifest │  │  Files   │  │   Health     │  │
│  │ (API key)│  │ (D1 R/W) │  │ (R2 R/W) │  │ (status)     │  │
│  └──────────┘  └────┬─────┘  └────┬─────┘  └──────────────┘  │
│                     │             │                            │
│              ┌──────┴─────┐  ┌────┴──────┐                    │
│              │  D1        │  │  R2       │                    │
│              │  amber-sync│  │  amber-   │                    │
│              │  (manifest │  │  sync     │                    │
│              │  + logs)   │  │  (files)  │                    │
│              └────────────┘  └───────────┘                    │
└───────────────────────────────────────────────────────────────┘
```

### Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Manifest storage | D1 (not local JSON) | Single source of truth. Observable. No sync-state drift. |
| File storage | Separate R2 bucket (`amber-sync`) | Clean isolation from `grove-storage`. No production risk. |
| Auth (weekend) | Simple API key in header | One user, fast to implement. Swap to Warden later. |
| Auth (productized) | Warden challenge-response HMAC | Agent-based, no raw R2 credentials in plugin. |
| Conflict strategy | Last-write-wins + conflict copies | No data loss. Both versions preserved. Manual reconciliation. |
| Change detection | Content hashing (MD5) | Reliable across devices. Timestamps lie. |
| .obsidian sync | Yes, with exclusion list | Plugins and themes sync. Workspace/cache do not. |

### Transport Abstraction (Path A → Path B)

The plugin talks to sync infrastructure through an interface, not directly to any API:

```typescript
interface SyncTransport {
  getManifest(): Promise<RemoteFileEntry[]>
  getChangesSince(timestamp: string): Promise<RemoteFileEntry[]>
  uploadFile(path: string, data: ArrayBuffer, deviceId: string): Promise<void>
  downloadFile(path: string): Promise<ArrayBuffer>
  deleteFile(path: string, deviceId: string): Promise<void>
}
```

**Weekend (Path A):** `WorkerTransport` — calls amber-sync Worker over HTTPS with API key.
**Productized (Path B):** `WardenTransport` — calls through Warden challenge-response HMAC. R2 keys never leave Warden. Full audit trail, scoped permissions, rate limiting.

The sync algorithm above this layer is identical in both paths. Migration = new transport implementation, no algorithm changes.

---

## Part 1: The Worker

### File Structure

```
workers/amber-sync/
├── src/
│   ├── index.ts              # Hono router, entry point
│   ├── types.ts              # Env bindings, shared types
│   ├── routes/
│   │   ├── health.ts         # GET /health
│   │   ├── manifest.ts       # GET /manifest, GET /manifest/since/:time
│   │   └── files.ts          # GET + PUT + DELETE /files/:key
│   ├── middleware/
│   │   └── auth.ts           # API key validation
│   └── lib/
│       └── hash.ts           # MD5 utility
├── migrations/
│   └── 0001_init.sql
├── wrangler.toml
└── package.json
```

### Cloudflare Resources

```toml
# wrangler.toml
name = "amber-sync"
main = "src/index.ts"
compatibility_date = "2024-09-23"

[[r2_buckets]]
binding = "SYNC_BUCKET"
bucket_name = "amber-sync"

[[d1_databases]]
binding = "DB"
database_name = "amber-sync"
database_id = "TODO"
```

Secrets (set via `wrangler secret put`):
- `SYNC_API_KEY` — the API key the plugin sends in `X-Sync-Key` header

### D1 Schema

```sql
-- migrations/0001_init.sql

-- The single source of truth for vault state
CREATE TABLE sync_manifest (
  path TEXT PRIMARY KEY,              -- 'notes/daily/2026-03-08.md'
  content_hash TEXT NOT NULL,          -- MD5 of file content
  size_bytes INTEGER NOT NULL,
  updated_at TEXT NOT NULL,            -- ISO 8601 timestamp
  updated_by TEXT NOT NULL,            -- device ID ('autumn-ipad-pro')
  deleted INTEGER DEFAULT 0            -- soft delete flag
);

-- Registered devices
CREATE TABLE sync_devices (
  device_id TEXT PRIMARY KEY,          -- 'autumn-ipad-pro'
  device_name TEXT,                    -- 'iPad Pro'
  last_sync_at TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Observability: what happened, when, by whom
CREATE TABLE sync_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  device_id TEXT NOT NULL,
  action TEXT NOT NULL,                -- 'upload' | 'download' | 'delete' | 'conflict'
  path TEXT NOT NULL,
  detail TEXT,                         -- optional context (conflict info, error, etc.)
  timestamp TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_manifest_updated ON sync_manifest(updated_at DESC);
CREATE INDEX idx_manifest_deleted ON sync_manifest(deleted);
CREATE INDEX idx_log_device ON sync_log(device_id, timestamp DESC);
CREATE INDEX idx_log_timestamp ON sync_log(timestamp DESC);
```

### API Routes

```
GET    /health
  → { status: 'ok', fileCount, totalBytes, lastSync, devices }

GET    /manifest
  → Full manifest: all rows from sync_manifest where deleted = 0
  → Returns: RemoteFileEntry[]

GET    /manifest/since/:timestamp
  → Incremental: rows where updated_at > :timestamp (includes deleted)
  → Returns: RemoteFileEntry[] (with deleted flag)
  → Use for fast incremental sync after initial full sync

PUT    /files/:key
  → Headers: X-Sync-Key, X-Device-Id, Content-Type
  → Body: raw file bytes
  → Action: write to R2, hash content, upsert manifest, log
  → Returns: { ok: true, hash, size }

GET    /files/:key
  → Returns: raw file bytes from R2 (streamed)

DELETE /files/:key
  → Headers: X-Sync-Key, X-Device-Id
  → Action: delete from R2, set deleted=1 in manifest, log
  → Returns: { ok: true }
```

### Auth Middleware (Weekend)

```typescript
// middleware/auth.ts
import type { MiddlewareHandler } from 'hono'

export function auth(): MiddlewareHandler {
  return async (c, next) => {
    const key = c.req.header('X-Sync-Key')
    if (!key || key !== c.env.SYNC_API_KEY) {
      return c.json({ error: 'unauthorized' }, 401)
    }
    await next()
  }
}
```

### PUT /files/:key (Core Route)

This is the most important route. It does three things atomically-ish:

```typescript
// routes/files.ts (PUT handler)
app.put('/files/:key{.+}', async (c) => {
  const key = c.req.param('key')
  const deviceId = c.req.header('X-Device-Id') || 'unknown'
  const body = await c.req.arrayBuffer()

  // 1. Hash content
  const hashBuffer = await crypto.subtle.digest('MD5', body)
  const contentHash = [...new Uint8Array(hashBuffer)]
    .map(b => b.toString(16).padStart(2, '0')).join('')

  // 2. Write to R2
  await c.env.SYNC_BUCKET.put(key, body, {
    customMetadata: { contentHash, deviceId }
  })

  // 3. Upsert manifest in D1
  await c.env.DB.prepare(`
    INSERT INTO sync_manifest (path, content_hash, size_bytes, updated_at, updated_by)
    VALUES (?, ?, ?, datetime('now'), ?)
    ON CONFLICT(path) DO UPDATE SET
      content_hash = excluded.content_hash,
      size_bytes = excluded.size_bytes,
      updated_at = excluded.updated_at,
      updated_by = excluded.updated_by,
      deleted = 0
  `).bind(key, contentHash, body.byteLength, deviceId).run()

  // 4. Log
  await c.env.DB.prepare(
    `INSERT INTO sync_log (device_id, action, path) VALUES (?, 'upload', ?)`
  ).bind(deviceId, key).run()

  return c.json({ ok: true, hash: contentHash, size: body.byteLength })
})
```

---

## Part 2: The Obsidian Plugin

### File Structure

```
amber-sync-plugin/
├── src/
│   ├── main.ts               # Plugin entry (onload, onunload, runSync)
│   ├── settings.ts           # Settings tab UI
│   ├── sync/
│   │   ├── engine.ts         # The sync orchestrator
│   │   ├── transport.ts      # SyncTransport interface + WorkerTransport impl
│   │   ├── differ.ts         # Three-way diff logic (the brain)
│   │   ├── hasher.ts         # MD5 hashing for local files
│   │   └── snapshot.ts       # Local snapshot cache (last-known sync state)
│   └── ui/
│       ├── status-bar.ts     # "Amber: synced 2m ago" in status bar
│       └── notice.ts         # Conflict/sync notifications
├── manifest.json             # Obsidian plugin manifest
├── styles.css                # Minimal styling
├── package.json
├── tsconfig.json
└── esbuild.config.mjs        # Build config (from sample plugin)
```

### Plugin Settings

```typescript
interface AmberSyncSettings {
  workerUrl: string           // 'https://amber-sync.YOUR-SUBDOMAIN.workers.dev'
  apiKey: string              // Simple key for weekend auth
  deviceId: string            // Auto-generated UUID on first run, per device
  deviceName: string          // Human-readable: 'iPad Pro', 'Mac Mini'
  syncOnStartup: boolean      // Default: true
  autoSyncMinutes: number     // Default: 5. Set 0 for manual only.
  excludes: string[]          // Paths to skip (see defaults below)
}

const DEFAULT_SETTINGS: AmberSyncSettings = {
  workerUrl: '',
  apiKey: '',
  deviceId: crypto.randomUUID(),
  deviceName: '',
  syncOnStartup: true,
  autoSyncMinutes: 5,
  excludes: [
    '.obsidian/workspace.json',
    '.obsidian/workspace-mobile.json',
    '.obsidian/cache/**',
    '.obsidian/plugins/amber-sync/data.json',
    '.trash/**',
  ]
}
```

### Plugin Entry Point

```typescript
// main.ts
import { Plugin, Notice } from 'obsidian'
import { AmberSyncSettingsTab } from './settings'
import { sync } from './sync/engine'
import { WorkerTransport } from './sync/transport'

export default class AmberSyncPlugin extends Plugin {
  settings: AmberSyncSettings

  async onload() {
    await this.loadSettings()

    // Ribbon icon — manual sync trigger
    this.addRibbonIcon('refresh-cw', 'Amber Sync', () => this.runSync())

    // Command palette
    this.addCommand({
      id: 'amber-sync-now',
      name: 'Sync now',
      callback: () => this.runSync()
    })

    // Status bar
    const statusBar = this.addStatusBarItem()
    statusBar.setText('Amber: ready')

    // Sync on startup (small delay for vault to fully load)
    if (this.settings.syncOnStartup && this.settings.workerUrl) {
      setTimeout(() => this.runSync(), 3000)
    }

    // Auto sync interval
    if (this.settings.autoSyncMinutes > 0) {
      this.registerInterval(
        window.setInterval(
          () => this.runSync(),
          this.settings.autoSyncMinutes * 60 * 1000
        )
      )
    }

    // Settings tab
    this.addSettingTab(new AmberSyncSettingsTab(this.app, this))
  }

  async runSync() {
    if (!this.settings.workerUrl || !this.settings.apiKey) {
      new Notice('Amber Sync: configure Worker URL and API key in settings')
      return
    }

    const transport = new WorkerTransport(
      this.settings.workerUrl,
      this.settings.apiKey,
      this.settings.deviceId
    )

    try {
      const result = await sync(
        this.app.vault,
        transport,
        this.settings.deviceId,
        this.settings.excludes
      )

      if (result.conflicts > 0) {
        new Notice(
          `Amber Sync: ${result.conflicts} conflict(s) created — look for .conflict files`
        )
      }

      new Notice(`Amber: ↑${result.uploaded} ↓${result.downloaded}`)
    } catch (err) {
      new Notice(`Amber Sync error: ${err.message}`)
      console.error('[amber-sync]', err)
    }
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData())
  }

  async saveSettings() {
    await this.saveData(this.settings)
  }
}
```

---

## Part 3: The Sync Algorithm

This is the heart of the system. Three-way comparison: local files, remote manifest (D1), and the last-known sync snapshot.

### The Three States

```
LOCAL FILE              LAST SYNC SNAPSHOT          REMOTE (D1 manifest)
(on this device)        (what it looked like         (what the Worker knows)
                         after our last sync)
```

Without the snapshot, you can't distinguish "I edited this" from "I haven't downloaded the update yet."

### The Snapshot

Stored locally in the plugin's data directory. Updated after every successful sync.

```typescript
// sync/snapshot.ts
interface SnapshotEntry {
  localHash: string
  remoteHash: string
  mtime: number
}

type SyncSnapshot = Record<string, SnapshotEntry>  // path → entry

async function loadSnapshot(vault: Vault): Promise<SyncSnapshot> {
  // Reads from .obsidian/plugins/amber-sync/snapshot.json
  // Returns {} on first run (empty snapshot = everything is new)
}

async function saveSnapshot(
  vault: Vault,
  localMap: Map<string, LocalEntry>,
  remoteMap: Map<string, RemoteFileEntry>
): Promise<void> {
  // Writes merged state to snapshot.json after successful sync
}
```

### The Differ (Three-Way Comparison)

```typescript
// sync/differ.ts

interface SyncActions {
  uploads: { path: string }[]
  downloads: { path: string }[]
  conflicts: { path: string, localNewer: boolean, remoteDeviceId: string }[]
  localDeletes: { path: string }[]    // delete the local copy
  remoteDeletes: { path: string }[]   // delete from remote
}

function diff(
  local: Map<string, LocalEntry>,       // path → { hash, mtime }
  remote: Map<string, RemoteFileEntry>,  // path → { contentHash, updatedAt, ... }
  snapshot: SyncSnapshot                 // path → { localHash, remoteHash }
): SyncActions {

  const actions: SyncActions = {
    uploads: [], downloads: [], conflicts: [],
    localDeletes: [], remoteDeletes: []
  }

  const allPaths = new Set([
    ...local.keys(), ...remote.keys(), ...Object.keys(snapshot)
  ])

  for (const path of allPaths) {
    const l = local.get(path)
    const r = remote.get(path)
    const s = snapshot[path]

    const localExists = !!l
    const remoteExists = r && !r.deleted
    const wasInSnapshot = !!s

    const localChanged = l && s ? l.hash !== s.localHash : false
    const remoteChanged = r && s ? r.contentHash !== s.remoteHash : false

    // ─── Both exist ───────────────────────────────────────────
    if (localExists && remoteExists) {
      if (l.hash === r.contentHash) continue  // identical → skip

      if (localChanged && remoteChanged) {
        // CONFLICT: both changed since last sync
        actions.conflicts.push({
          path,
          localNewer: l.mtime > new Date(r.updatedAt).getTime(),
          remoteDeviceId: r.updatedBy
        })
      } else if (localChanged) {
        actions.uploads.push({ path })
      } else if (remoteChanged) {
        actions.downloads.push({ path })
      } else {
        // Hashes differ but neither flagged as changed vs snapshot
        // (edge case: snapshot was stale). Download remote as tiebreaker.
        actions.downloads.push({ path })
      }
    }

    // ─── New file (no snapshot entry) ─────────────────────────
    else if (localExists && !remoteExists && !wasInSnapshot) {
      actions.uploads.push({ path })  // new local file → upload
    }
    else if (!localExists && remoteExists && !wasInSnapshot) {
      actions.downloads.push({ path })  // new remote file → download
    }

    // ─── Deletion detection (was in snapshot) ─────────────────
    else if (localExists && !remoteExists && wasInSnapshot) {
      // Was synced before, now gone from remote → another device deleted it
      actions.localDeletes.push({ path })
    }
    else if (!localExists && remoteExists && wasInSnapshot) {
      // Was synced before, now gone locally → we deleted it
      actions.remoteDeletes.push({ path })
    }
  }

  return actions
}
```

### The Sync Engine (Orchestrator)

```typescript
// sync/engine.ts

interface SyncResult {
  uploaded: number
  downloaded: number
  conflicts: number
  deleted: number
  errors: string[]
}

async function sync(
  vault: Vault,
  transport: SyncTransport,
  deviceId: string,
  excludes: string[]
): Promise<SyncResult> {

  const errors: string[] = []

  // 1. Get remote manifest from Worker (D1)
  const remoteFiles = await transport.getManifest()
  const remoteMap = new Map(remoteFiles.map(f => [f.path, f]))

  // 2. Scan local vault + hash every file
  const localMap = new Map<string, LocalEntry>()
  for (const file of vault.getFiles()) {
    if (isExcluded(file.path, excludes)) continue
    try {
      const data = await vault.readBinary(file)
      const hash = await md5(data)
      localMap.set(file.path, { hash, mtime: file.stat.mtime, size: file.stat.size })
    } catch (err) {
      errors.push(`Failed to read ${file.path}: ${err.message}`)
    }
  }

  // 3. Load last sync snapshot
  const snapshot = await loadSnapshot(vault)

  // 4. Three-way diff
  const actions = diff(localMap, remoteMap, snapshot)

  // 5. Execute in safe order ─────────────────────────────────

  //    a. Downloads first (get latest from other devices)
  for (const dl of actions.downloads) {
    try {
      const data = await transport.downloadFile(dl.path)
      // Ensure parent directories exist
      const dir = dl.path.substring(0, dl.path.lastIndexOf('/'))
      if (dir && !vault.getAbstractFileByPath(dir)) {
        await vault.createFolder(dir)
      }
      await vault.adapter.writeBinary(dl.path, Buffer.from(data))
    } catch (err) {
      errors.push(`Download failed: ${dl.path}: ${err.message}`)
    }
  }

  //    b. Conflict copies (preserve BOTH versions, then resolve)
  for (const conflict of actions.conflicts) {
    try {
      const loser = conflict.localNewer ? 'remote' : 'local'

      if (loser === 'local') {
        // Local is older → save local as conflict copy, download remote winner
        const localFile = vault.getAbstractFileByPath(conflict.path)
        if (localFile) {
          const localData = await vault.readBinary(localFile)
          const conflictPath = makeConflictPath(conflict.path, deviceId)
          await vault.adapter.writeBinary(conflictPath, localData)
        }
        const remoteData = await transport.downloadFile(conflict.path)
        await vault.adapter.writeBinary(conflict.path, Buffer.from(remoteData))
      } else {
        // Remote is older → save remote as conflict copy, upload local winner
        const remoteData = await transport.downloadFile(conflict.path)
        const conflictPath = makeConflictPath(conflict.path, conflict.remoteDeviceId)
        await vault.adapter.writeBinary(conflictPath, Buffer.from(remoteData))
        const localFile = vault.getAbstractFileByPath(conflict.path)
        if (localFile) {
          const localData = await vault.readBinary(localFile)
          await transport.uploadFile(conflict.path, localData, deviceId)
        }
      }
    } catch (err) {
      errors.push(`Conflict resolution failed: ${conflict.path}: ${err.message}`)
    }
  }

  //    c. Uploads (push local changes)
  for (const ul of actions.uploads) {
    try {
      const file = vault.getAbstractFileByPath(ul.path)
      if (file) {
        const data = await vault.readBinary(file)
        await transport.uploadFile(ul.path, data, deviceId)
      }
    } catch (err) {
      errors.push(`Upload failed: ${ul.path}: ${err.message}`)
    }
  }

  //    d. Deletes
  for (const del of actions.localDeletes) {
    try {
      const file = vault.getAbstractFileByPath(del.path)
      if (file) await vault.delete(file)
    } catch (err) {
      errors.push(`Local delete failed: ${del.path}: ${err.message}`)
    }
  }
  for (const del of actions.remoteDeletes) {
    try {
      await transport.deleteFile(del.path, deviceId)
    } catch (err) {
      errors.push(`Remote delete failed: ${del.path}: ${err.message}`)
    }
  }

  // 6. Re-scan and save updated snapshot
  const updatedRemote = await transport.getManifest()
  const updatedRemoteMap = new Map(updatedRemote.map(f => [f.path, f]))

  // Re-hash local (some files changed during sync)
  const updatedLocalMap = new Map<string, LocalEntry>()
  for (const file of vault.getFiles()) {
    if (isExcluded(file.path, excludes)) continue
    try {
      const data = await vault.readBinary(file)
      const hash = await md5(data)
      updatedLocalMap.set(file.path, { hash, mtime: file.stat.mtime, size: file.stat.size })
    } catch { /* skip */ }
  }

  await saveSnapshot(vault, updatedLocalMap, updatedRemoteMap)

  return {
    uploaded: actions.uploads.length,
    downloaded: actions.downloads.length,
    conflicts: actions.conflicts.length,
    deleted: actions.localDeletes.length + actions.remoteDeletes.length,
    errors
  }
}

// ─── Helpers ──────────────────────────────────────────────────

function makeConflictPath(path: string, sourceId: string): string {
  const dot = path.lastIndexOf('.')
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  if (dot > -1) {
    return `${path.slice(0, dot)}.conflict-${sourceId}-${timestamp}${path.slice(dot)}`
  }
  return `${path}.conflict-${sourceId}-${timestamp}`
}

function isExcluded(path: string, excludes: string[]): boolean {
  return excludes.some(pattern => {
    if (pattern.endsWith('/**')) {
      return path.startsWith(pattern.slice(0, -3))
    }
    return path === pattern || path.startsWith(pattern + '/')
  })
}
```

### The Transport Implementation

```typescript
// sync/transport.ts

interface RemoteFileEntry {
  path: string
  contentHash: string
  sizeBytes: number
  updatedAt: string
  updatedBy: string
  deleted: boolean
}

interface SyncTransport {
  getManifest(): Promise<RemoteFileEntry[]>
  getChangesSince(timestamp: string): Promise<RemoteFileEntry[]>
  uploadFile(path: string, data: ArrayBuffer, deviceId: string): Promise<void>
  downloadFile(path: string): Promise<ArrayBuffer>
  deleteFile(path: string, deviceId: string): Promise<void>
}

class WorkerTransport implements SyncTransport {
  constructor(
    private workerUrl: string,
    private apiKey: string,
    private deviceId: string
  ) {}

  private headers(): Record<string, string> {
    return {
      'X-Sync-Key': this.apiKey,
      'X-Device-Id': this.deviceId
    }
  }

  async getManifest(): Promise<RemoteFileEntry[]> {
    const res = await fetch(`${this.workerUrl}/manifest`, {
      headers: this.headers()
    })
    if (!res.ok) throw new Error(`Manifest fetch failed: ${res.status}`)
    return res.json()
  }

  async getChangesSince(timestamp: string): Promise<RemoteFileEntry[]> {
    const res = await fetch(
      `${this.workerUrl}/manifest/since/${encodeURIComponent(timestamp)}`,
      { headers: this.headers() }
    )
    if (!res.ok) throw new Error(`Incremental manifest failed: ${res.status}`)
    return res.json()
  }

  async uploadFile(path: string, data: ArrayBuffer, deviceId: string): Promise<void> {
    const res = await fetch(`${this.workerUrl}/files/${encodeURIComponent(path)}`, {
      method: 'PUT',
      headers: { ...this.headers(), 'Content-Type': 'application/octet-stream' },
      body: data
    })
    if (!res.ok) throw new Error(`Upload failed: ${path}: ${res.status}`)
  }

  async downloadFile(path: string): Promise<ArrayBuffer> {
    const res = await fetch(`${this.workerUrl}/files/${encodeURIComponent(path)}`, {
      headers: this.headers()
    })
    if (!res.ok) throw new Error(`Download failed: ${path}: ${res.status}`)
    return res.arrayBuffer()
  }

  async deleteFile(path: string, deviceId: string): Promise<void> {
    const res = await fetch(`${this.workerUrl}/files/${encodeURIComponent(path)}`, {
      method: 'DELETE',
      headers: this.headers()
    })
    if (!res.ok) throw new Error(`Delete failed: ${path}: ${res.status}`)
  }
}
```

---

## Default Exclusions

```typescript
const DEFAULT_EXCLUDES = [
  '.obsidian/workspace.json',          // Changes every time Obsidian opens
  '.obsidian/workspace-mobile.json',   // Same for mobile
  '.obsidian/cache/**',                // Transient cache data
  '.obsidian/plugins/amber-sync/data.json',  // This plugin's own credentials
  '.trash/**',                         // Obsidian's trash folder
]
```

Everything else in `.obsidian/` syncs: plugins, themes, snippets, hotkeys, appearance settings.

---

## Conflict Handling

**Strategy: Last-write-wins with conflict copies.**

When both local and remote have changed since the last sync:

1. Compare modification times (local `mtime` vs remote `updatedAt`)
2. The newer version wins → becomes the canonical file
3. The older version is saved as `filename.conflict-{deviceId}-{timestamp}.ext`
4. Both versions are preserved. Zero data loss.
5. A Notice tells you conflicts were created.

Conflict files are regular markdown files in your vault. You'll see them. Merge manually, delete the one you don't want.

For one user who mostly writes on one device at a time: conflicts will be rare. When they happen, they're visible and recoverable.

---

## Initial Sync (First Device Connecting)

**First device ever (empty R2 bucket):**
- Snapshot is empty (`{}`)
- Remote manifest is empty
- Every local file is "new local, never synced" → upload everything
- Snapshot is saved after upload completes

**Second device connecting (bucket already populated):**
- Snapshot is empty on this device
- Remote manifest has entries
- Every remote file is "new remote, never seen locally" → download everything
- Snapshot is saved after download completes

**No special handling needed.** The three-way diff naturally handles this because an empty snapshot means "nothing was synced before" → everything is new.

---

## Weekend Sprint Timeline

| Block | Time | Deliverable |
|-------|------|-------------|
| Saturday AM | 2-3 hrs | Worker deployed: D1 schema, five routes, auth, tested with `curl` |
| Saturday PM | 3-4 hrs | Plugin scaffolded: transport, settings tab, manual sync button, first upload working |
| Sunday AM | 3-4 hrs | Full sync engine: differ, three-way comparison, downloads + uploads working across Mac → iPad |
| Sunday PM | 2-3 hrs | Conflict handling tested. .obsidian sync with exclusions. Status bar. Polish. |
| Sunday Night | — | Vault syncing across 3 devices. Cancel Obsidian Sync. |

---

## Productization Path (Future)

When Amber Sync becomes a Grove service:

1. **Auth:** Swap `WorkerTransport` for `WardenTransport`. Plugin holds Warden `agentId` + `agentSecret`. Warden does HMAC challenge-response, injects R2 credentials. Raw keys never leave Warden.

2. **Multi-tenant:** Worker becomes tenant-aware. R2 key prefixed by tenant ID. D1 manifest rows scoped to tenant.

3. **Registration:** Wanderers provision sync via Amber dashboard. Creates R2 prefix, Warden agent, returns credentials for plugin setup.

4. **Pricing:** R2 costs ~$0.015/GB/month. Offer generous free tier (1GB), paid tiers for heavy media vaults. Mostly free for text-heavy users.

5. **Publish plugin:** Submit to Obsidian community plugin directory once stable.

---

## References

| Document | Purpose |
|----------|---------|
| `docs/specs/amber-spec.md` | Amber storage management (main spec) |
| `docs/specs/amber-sync-spec.md` | Original sync vision (January 2026) |
| `docs/specs/warden-spec.md` | Warden API gateway (auth productization path) |
| [Obsidian Plugin API](https://docs.obsidian.md/Plugins/Getting+started/Build+a+plugin) | Plugin development docs |
| [Obsidian Sample Plugin](https://github.com/obsidianmd/obsidian-sample-plugin) | Plugin template repo |
| [Remotely Save](https://github.com/remotely-save/remotely-save) | Reference implementation (Apache 2.0 fork) |

---

_Your vault. Your infrastructure. Your sync. Preserved in Amber._
