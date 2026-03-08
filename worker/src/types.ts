import type { D1Database, R2Bucket } from "@cloudflare/workers-types";

export interface Env {
  DB: D1Database;
  SYNC_BUCKET: R2Bucket;
  SYNC_API_KEY: string;
}

export interface RemoteFileEntry {
  path: string;
  contentHash: string;
  sizeBytes: number;
  updatedAt: string;
  updatedBy: string;
  deleted: boolean;
}
