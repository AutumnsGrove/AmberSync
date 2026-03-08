import { Hono } from "hono";
import type { Env, RemoteFileEntry } from "../types";

const manifest = new Hono<{ Bindings: Env }>();

// Full manifest — all non-deleted entries
manifest.get("/manifest", async (c) => {
  const result = await c.env.DB.prepare(
    `SELECT path, content_hash, size_bytes, updated_at, updated_by, deleted
     FROM sync_manifest WHERE deleted = 0`,
  ).all();

  const entries: RemoteFileEntry[] = result.results.map((row: any) => ({
    path: row.path,
    contentHash: row.content_hash,
    sizeBytes: row.size_bytes,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
    deleted: !!row.deleted,
  }));

  return c.json(entries);
});

// Incremental manifest — changes since a given timestamp (includes deleted)
manifest.get("/manifest/since/:timestamp", async (c) => {
  const timestamp = decodeURIComponent(c.req.param("timestamp"));

  const result = await c.env.DB.prepare(
    `SELECT path, content_hash, size_bytes, updated_at, updated_by, deleted
     FROM sync_manifest WHERE updated_at > ?`,
  )
    .bind(timestamp)
    .all();

  const entries: RemoteFileEntry[] = result.results.map((row: any) => ({
    path: row.path,
    contentHash: row.content_hash,
    sizeBytes: row.size_bytes,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
    deleted: !!row.deleted,
  }));

  return c.json(entries);
});

export { manifest };
