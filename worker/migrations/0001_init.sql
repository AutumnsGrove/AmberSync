-- Amber Sync: D1 Schema
-- The single source of truth for vault state across all devices.

-- ─── Manifest ──────────────────────────────────────────────────
-- Every synced file has exactly one row. This is what devices
-- compare against to determine uploads, downloads, and conflicts.

CREATE TABLE sync_manifest (
  path TEXT PRIMARY KEY,              -- 'notes/daily/2026-03-08.md'
  content_hash TEXT NOT NULL,          -- MD5 of file content
  size_bytes INTEGER NOT NULL,
  updated_at TEXT NOT NULL,            -- ISO 8601 (set by Worker, not client)
  updated_by TEXT NOT NULL,            -- device ID ('autumn-ipad-pro')
  deleted INTEGER DEFAULT 0            -- 1 = soft-deleted (another device deleted it)
);

-- ─── Devices ───────────────────────────────────────────────────
-- Track which devices have connected and when they last synced.

CREATE TABLE sync_devices (
  device_id TEXT PRIMARY KEY,          -- UUID auto-generated per device
  device_name TEXT,                    -- Human-readable: 'iPad Pro'
  last_sync_at TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- ─── Sync Log ──────────────────────────────────────────────────
-- Full audit trail. Every action logged with device, path, and time.
-- This is your observability layer — query it to see exactly
-- what happened and when.

CREATE TABLE sync_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  device_id TEXT NOT NULL,
  action TEXT NOT NULL,                -- 'upload' | 'download' | 'delete' | 'conflict'
  path TEXT NOT NULL,
  detail TEXT,                         -- optional context (conflict info, error, hash)
  timestamp TEXT DEFAULT (datetime('now'))
);

-- ─── Indexes ───────────────────────────────────────────────────

CREATE INDEX idx_manifest_updated ON sync_manifest(updated_at DESC);
CREATE INDEX idx_manifest_deleted ON sync_manifest(deleted);
CREATE INDEX idx_log_device ON sync_log(device_id, timestamp DESC);
CREATE INDEX idx_log_timestamp ON sync_log(timestamp DESC);
