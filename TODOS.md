# Amber Sync — TODOs

## Phase 1: Worker (Saturday AM)
- [ ] Create `worker/src/index.ts` — Hono router entry point
- [ ] Create `worker/src/types.ts` — Env bindings, shared types
- [ ] Create `worker/src/middleware/auth.ts` — API key validation middleware
- [ ] Create `worker/src/lib/hash.ts` — MD5 utility
- [ ] Create `worker/src/routes/health.ts` — GET /health
- [ ] Create `worker/src/routes/manifest.ts` — GET /manifest, GET /manifest/since/:time
- [ ] Create `worker/src/routes/files.ts` — PUT + GET + DELETE /files/:key
- [ ] Create D1 database and update `wrangler.toml` with database_id
- [ ] Create R2 bucket (`amber-sync`)
- [ ] Run migration: `wrangler d1 execute amber-sync --file=migrations/0001_init.sql`
- [ ] Set secret: `wrangler secret put SYNC_API_KEY`
- [ ] Deploy worker and test all routes with `curl`

## Phase 2: Plugin Scaffold (Saturday PM)
- [ ] Create `plugin/src/sync/transport.ts` — SyncTransport interface + WorkerTransport
- [ ] Create `plugin/src/sync/hasher.ts` — MD5 hashing for local files
- [ ] Create `plugin/src/settings.ts` — Settings tab UI
- [ ] Create `plugin/src/main.ts` — Plugin entry point (onload, runSync)
- [ ] Create `plugin/src/ui/status-bar.ts` — Status bar indicator
- [ ] Create `plugin/src/ui/notice.ts` — Notifications
- [ ] Build plugin and test manual sync (upload) to deployed Worker

## Phase 3: Sync Engine (Sunday AM)
- [ ] Create `plugin/src/sync/snapshot.ts` — Local snapshot cache
- [ ] Create `plugin/src/sync/differ.ts` — Three-way diff algorithm
- [ ] Create `plugin/src/sync/engine.ts` — Sync orchestrator
- [ ] Test full cycle: Mac uploads → iPad downloads
- [ ] Test incremental sync (only changed files transferred)

## Phase 4: Polish (Sunday PM)
- [ ] Implement conflict handling + conflict copy creation
- [ ] Test .obsidian/ sync with default exclusion list
- [ ] Status bar shows sync state ("synced 2m ago", "syncing...", errors)
- [ ] Auto-sync interval working
- [ ] Test across all 3 devices (Mac Mini, iPad Pro, iPhone)
- [ ] Cancel Obsidian Sync subscription
