# Amber Sync

> Your vault. Your infrastructure. Your sync. $0/month.

Personal Obsidian vault synchronization built on Cloudflare Workers, D1, and R2. Replaces Obsidian Sync with a self-hosted solution on Cloudflare's free tier.

## How It Works

```
Obsidian (any device)  →  Amber Sync Worker  →  R2 (file storage)
                            ↕                      ↕
                          D1 (manifest)        Your vault files
```

An Obsidian plugin syncs your vault through a Cloudflare Worker. The Worker stores files in an R2 bucket and tracks vault state in a D1 database (the "manifest"). Every device asks the same manifest — one source of truth, no sync-state drift.

**Conflict handling:** Last-write-wins with conflict copies. Both versions are always preserved. Nothing is ever silently overwritten.

## Repository Structure

```
amber-sync/
├── worker/                    # Cloudflare Worker (Hono + D1 + R2)
│   ├── src/
│   │   ├── index.ts           # Hono router
│   │   ├── types.ts           # Env bindings
│   │   ├── routes/
│   │   │   ├── health.ts      # GET /health
│   │   │   ├── manifest.ts    # GET /manifest
│   │   │   └── files.ts       # GET/PUT/DELETE /files/:key
│   │   ├── middleware/
│   │   │   └── auth.ts        # API key validation
│   │   └── lib/
│   │       └── hash.ts        # MD5 utility
│   ├── migrations/
│   │   └── 0001_init.sql      # D1 schema
│   ├── wrangler.toml
│   └── package.json
│
├── plugin/                    # Obsidian plugin (TypeScript)
│   ├── src/
│   │   ├── main.ts            # Plugin entry point
│   │   ├── settings.ts        # Settings tab
│   │   ├── sync/
│   │   │   ├── engine.ts      # Sync orchestrator
│   │   │   ├── transport.ts   # SyncTransport interface + WorkerTransport
│   │   │   ├── differ.ts      # Three-way diff algorithm
│   │   │   ├── hasher.ts      # MD5 hashing
│   │   │   └── snapshot.ts    # Local sync state cache
│   │   └── ui/
│   │       ├── status-bar.ts  # Status bar indicator
│   │       └── notice.ts      # Notifications
│   ├── manifest.json
│   ├── styles.css
│   ├── package.json
│   └── tsconfig.json
│
├── docs/
│   └── amber-sync-mvp-spec.md  # Full architecture spec
│
└── README.md
```

## Setup

### 1. Deploy the Worker

```bash
cd worker
npm install

# Create R2 bucket
wrangler r2 bucket create amber-sync

# Create D1 database
wrangler d1 create amber-sync
# Copy the database_id into wrangler.toml

# Run migration
wrangler d1 execute amber-sync --file=migrations/0001_init.sql

# Set the API key secret
wrangler secret put SYNC_API_KEY
# Enter a strong random key — you'll put this in the plugin settings too

# Deploy
wrangler deploy
```

### 2. Install the Plugin

```bash
cd plugin
npm install
npm run build
```

Copy `main.js`, `manifest.json`, and `styles.css` into your vault at:
```
<your-vault>/.obsidian/plugins/amber-sync/
```

Enable "Amber Sync" in Obsidian → Settings → Community Plugins.

### 3. Configure

In Obsidian → Settings → Amber Sync:

- **Worker URL:** `https://amber-sync.<your-subdomain>.workers.dev`
- **API Key:** the key you set in step 1
- **Device Name:** something recognizable (e.g. "iPad Pro")
- **Auto Sync:** every 5 minutes (or your preference)

### 4. First Sync

Click the refresh icon in the ribbon (left sidebar) or use the command palette: "Amber Sync: Sync now".

First device uploads everything. Second/third device downloads everything. The three-way diff handles this automatically.

## How Sync Works

Every sync cycle:

1. **Fetch remote manifest** from D1 (what the Worker knows)
2. **Scan local vault** and hash every file (what this device has)
3. **Load snapshot** of last successful sync (what things looked like last time)
4. **Three-way diff** to categorize each file:
   - Same everywhere → skip
   - Changed locally only → upload
   - Changed remotely only → download
   - Changed both sides → **conflict** (save both versions)
   - New local → upload
   - New remote → download
   - Deleted locally, exists remote + was in snapshot → delete remote
   - Deleted remotely, exists local + was in snapshot → delete local
5. **Execute** in safe order: downloads → conflict copies → uploads → deletes
6. **Save updated snapshot**

## Conflict Files

When a conflict occurs, the losing version is saved as:

```
original-name.conflict-{deviceId}-{timestamp}.md
```

Both versions are preserved. Merge manually, then delete the conflict copy.

## What Syncs

**Synced:** All vault files including `.obsidian/` (plugins, themes, snippets, hotkeys).

**Excluded by default:**
- `.obsidian/workspace.json` — changes on every open
- `.obsidian/workspace-mobile.json` — same
- `.obsidian/cache/**` — transient data
- `.obsidian/plugins/amber-sync/data.json` — this plugin's credentials
- `.trash/**` — Obsidian's trash

## Cost

R2 free tier: 10 GB storage, 10M reads/month, 1M writes/month. A text-heavy vault with 500+ notes is typically well under 500 MB. **Effectively $0/month.**

## Future

This is a personal tool today. The transport layer is abstracted behind a `SyncTransport` interface, designed to be swapped from direct Worker calls to Warden (Grove's API gateway) for multi-tenant productization. See [docs/amber-sync-mvp-spec.md](docs/amber-sync-mvp-spec.md) for the full architecture and productization path.

---

*Preserved in Amber.*
