import { Hono } from "hono";
import type { Env } from "../types";

const health = new Hono<{ Bindings: Env }>();

health.get("/health", async (c) => {
  const stats = await c.env.DB.prepare(
    `SELECT
      COUNT(*) as fileCount,
      COALESCE(SUM(size_bytes), 0) as totalBytes,
      MAX(updated_at) as lastSync
    FROM sync_manifest WHERE deleted = 0`,
  ).first<{ fileCount: number; totalBytes: number; lastSync: string | null }>();

  const devices = await c.env.DB.prepare(
    `SELECT device_id, device_name, last_sync_at FROM sync_devices`,
  ).all();

  return c.json({
    status: "ok",
    fileCount: stats?.fileCount ?? 0,
    totalBytes: stats?.totalBytes ?? 0,
    lastSync: stats?.lastSync ?? null,
    devices: devices.results,
  });
});

export { health };
