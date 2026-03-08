import { Hono } from "hono";
import type { Env } from "../types";
import { md5 } from "../lib/hash";

const files = new Hono<{ Bindings: Env }>();

// Upload file
files.put("/files/:key{.+}", async (c) => {
  const key = c.req.param("key");
  const deviceId = c.req.header("X-Device-Id") || "unknown";
  const body = await c.req.arrayBuffer();

  // 1. Hash content
  const contentHash = await md5(body);

  // 2. Write to R2
  await c.env.SYNC_BUCKET.put(key, body, {
    customMetadata: { contentHash, deviceId },
  });

  // 3. Upsert manifest in D1
  await c.env.DB.prepare(
    `INSERT INTO sync_manifest (path, content_hash, size_bytes, updated_at, updated_by)
     VALUES (?, ?, ?, datetime('now'), ?)
     ON CONFLICT(path) DO UPDATE SET
       content_hash = excluded.content_hash,
       size_bytes = excluded.size_bytes,
       updated_at = excluded.updated_at,
       updated_by = excluded.updated_by,
       deleted = 0`,
  )
    .bind(key, contentHash, body.byteLength, deviceId)
    .run();

  // 4. Log
  await c.env.DB.prepare(
    `INSERT INTO sync_log (device_id, action, path) VALUES (?, 'upload', ?)`,
  )
    .bind(deviceId, key)
    .run();

  // 5. Update device last_sync_at
  await c.env.DB.prepare(
    `INSERT INTO sync_devices (device_id, last_sync_at)
     VALUES (?, datetime('now'))
     ON CONFLICT(device_id) DO UPDATE SET last_sync_at = datetime('now')`,
  )
    .bind(deviceId)
    .run();

  return c.json({ ok: true, hash: contentHash, size: body.byteLength });
});

// Download file
files.get("/files/:key{.+}", async (c) => {
  const key = c.req.param("key");
  const object = await c.env.SYNC_BUCKET.get(key);

  if (!object) {
    return c.json({ error: "not found" }, 404);
  }

  c.header("Content-Type", "application/octet-stream");
  return c.body(object.body as ReadableStream);
});

// Delete file
files.delete("/files/:key{.+}", async (c) => {
  const key = c.req.param("key");
  const deviceId = c.req.header("X-Device-Id") || "unknown";

  // 1. Delete from R2
  await c.env.SYNC_BUCKET.delete(key);

  // 2. Soft-delete in D1 manifest
  await c.env.DB.prepare(
    `UPDATE sync_manifest
     SET deleted = 1, updated_at = datetime('now'), updated_by = ?
     WHERE path = ?`,
  )
    .bind(deviceId, key)
    .run();

  // 3. Log
  await c.env.DB.prepare(
    `INSERT INTO sync_log (device_id, action, path) VALUES (?, 'delete', ?)`,
  )
    .bind(deviceId, key)
    .run();

  return c.json({ ok: true });
});

export { files };
