# Project Instructions - Agent Workflows

> **Note**: This is the main orchestrator file. For detailed guides, see `AgentUsage/README.md`

---

## Project Purpose

Amber Sync is a personal Obsidian vault synchronization system built on Cloudflare Workers, D1, and R2. It replaces Obsidian Sync ($10/month) with a self-hosted solution that costs effectively $0/month on Cloudflare's free tier.

**Scope:** Personal use — one user (Autumn), one vault, three Apple devices (Mac Mini, iPad Pro, iPhone). Designed with a clean transport abstraction for future productization as a Grove service.

## Tech Stack
- **Language:** TypeScript
- **Worker Framework:** Hono (on Cloudflare Workers)
- **Storage:** Cloudflare R2 (files) + D1 (manifest/sync state)
- **Client:** Obsidian Plugin API
- **Build:** esbuild (plugin), wrangler (worker)
- **Package Manager:** npm

## Architecture Notes

Two halves: a **Cloudflare Worker** (the brain) and an **Obsidian Plugin** (the client).

- **Worker** (`worker/`): Hono router with 5 API routes. D1 stores the sync manifest (single source of truth). R2 stores actual vault files. Auth via API key header (weekend MVP), swappable to Warden HMAC later.
- **Plugin** (`plugin/`): Three-way diff sync engine. Compares local files, remote manifest (D1), and a local snapshot of last-known sync state. Transport abstraction (`SyncTransport` interface) decouples sync logic from API implementation.
- **Conflict strategy:** Last-write-wins with conflict copies. Both versions always preserved.
- **Change detection:** Content hashing (MD5), not timestamps.

### Key Files
| Path | Purpose |
|------|---------|
| `worker/src/index.ts` | Hono router, entry point |
| `worker/src/routes/files.ts` | Core PUT/GET/DELETE file routes |
| `worker/src/middleware/auth.ts` | API key validation |
| `worker/migrations/0001_init.sql` | D1 schema |
| `plugin/src/main.ts` | Plugin entry point |
| `plugin/src/sync/engine.ts` | Sync orchestrator |
| `plugin/src/sync/differ.ts` | Three-way diff algorithm |
| `plugin/src/sync/transport.ts` | SyncTransport interface + WorkerTransport |
| `plugin/src/sync/snapshot.ts` | Local sync state cache |
| `docs/amber-sync-mvp-spec.md` | Full architecture spec |

---

## Essential Instructions (Always Follow)

### Core Behavior
- Do what has been asked; nothing more, nothing less
- NEVER create files unless absolutely necessary for achieving your goal
- ALWAYS prefer editing existing files to creating new ones
- NEVER proactively create documentation files (*.md) or README files unless explicitly requested

### Naming Conventions
- **Directories**: Use CamelCase (e.g., `VideoProcessor`, `AudioTools`, `DataAnalysis`)
- **Date-based paths**: Use skewer-case with YYYY-MM-DD (e.g., `logs-2025-01-15`, `backup-2025-12-31`)
- **No spaces or underscores** in directory names (except date-based paths)

### TODO Management
- **Always check `TODOS.md` first** when starting a task or session
- **Check `COMPLETED.md`** for context on past decisions and implementation details
- **Update immediately** when tasks are completed, added, or changed
- **Move completed tasks** from `TODOS.md` to `COMPLETED.md` to keep the TODO list focused
- Keep both lists current and accurate

### Git Workflow Essentials

**After completing major changes, you MUST commit your work.**

**Conventional Commits Format:**
```bash
<type>: <brief description>

<optional body>
```

**Common Types:** `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `perf`

**Examples:**
```bash
feat: Add user authentication
fix: Correct timezone bug
docs: Update README
```

**For complete details:** See `AgentUsage/git_guide.md`

### Pull Requests

Use conventional commits format for PR titles:
```
feat: Add dark mode toggle
fix: Correct timezone bug
```

Write a brief description of what the PR does and why. No specific format required.

---

## When to Use Skills

**This project uses Claude Code Skills for specialized workflows. Invoke skills using the Skill tool when you encounter these situations:**

### Secrets & API Keys
- **When managing API keys or secrets** → Use skill: `secrets-management`
- **Before implementing secrets loading** → Use skill: `secrets-management`
- **When integrating external APIs** → Use skill: `api-integration`

### Cloudflare Development
- **When deploying to Cloudflare** → Use skill: `cloudflare-deployment`
- **Before using Cloudflare Workers, KV, R2, or D1** → Use skill: `cloudflare-deployment`
- **When setting up Cloudflare MCP server** → Use skill: `cloudflare-deployment`

### Version Control
- **Before making a git commit** → Use skill: `git-workflows`
- **Before creating a pull request** → Use skill: `git-workflows`
- **When initializing a new repo** → Use skill: `git-workflows`
- **For git workflow and branching** → Use skill: `git-workflows`
- **When setting up git hooks** → Use skill: `git-hooks`

### Code Quality & Testing
- **Decide what to test and write tests** → Use skill: `beaver-build`
- **Fix specific bugs precisely** → Use skill: `panther-strike`
- **Debug issues systematically** → Use skill: `mole-debug`
- **Optimize code for performance** → Use skill: `fox-optimize`
- **Security audit and hardening** → Use skill: `raccoon-audit` / `hawk-survey` / `turtle-harden`

### Testing
- **When writing JavaScript/TypeScript tests** → Use skill: `javascript-testing`
- **When deciding what to test or reviewing test quality** → Use skill: `grove-testing`

### Project Organization
- **Explore codebase to understand patterns** → Use skill: `bloodhound-scout`
- **Design system architecture** → Use skill: `eagle-architect`
- **Implement multi-file features** → Use skill: `elephant-build`

### Research & Analysis
- **When researching technology decisions** → Use skill: `research-strategy`
- **For systematic investigation** → Use skill: `research-strategy`

---

## Quick Reference

### How to Use Skills
Skills are invoked using the Skill tool. When a situation matches a skill trigger:
1. Invoke the skill by name (e.g., `skill: "secrets-management"`)
2. The skill will expand with detailed instructions
3. Follow the skill's guidance for the specific task

### Security Basics
- Store API keys in `secrets.json` (NEVER commit)
- Worker secrets set via `wrangler secret put SYNC_API_KEY`
- Plugin stores API key in Obsidian's plugin data (excluded from sync)
- Use environment variables as fallbacks

### Development Commands

```bash
# Worker
cd worker
npm install
wrangler dev                    # Local dev server
wrangler deploy                 # Deploy to Cloudflare
wrangler d1 execute amber-sync --file=migrations/0001_init.sql  # Run migrations

# Plugin
cd plugin
npm install
npm run build                   # Build plugin
# Copy main.js, manifest.json, styles.css to vault/.obsidian/plugins/amber-sync/
```

---

## Code Style Guidelines

### Function & Variable Naming
- Use meaningful, descriptive names
- Keep functions small and focused on single responsibilities
- Add docstrings to functions and classes

### Error Handling
- Use try/except blocks gracefully
- Provide helpful error messages
- Never let errors fail silently

### File Organization
- Group related functionality into modules
- Use consistent import ordering:
  1. Standard library
  2. Third-party packages
  3. Local imports
- Keep configuration separate from logic

---

## Communication Style
- Be concise but thorough
- Explain reasoning for significant decisions
- Ask for clarification when requirements are ambiguous
- Proactively suggest improvements when appropriate

---

## Additional Resources

### Skills Documentation
Skills are the primary way to access specialized knowledge. Use the Skill tool to invoke them.
Skills are located in `.claude/skills/` and provide concise, actionable guidance.

### Extended Documentation
For in-depth reference beyond what skills provide, see:
**`AgentUsage/README.md`** - Master index of detailed documentation

---

## Grove Wrap (gw) Tool

This project uses **Grove Wrap (`gw`)** as the primary CLI tool for git operations, GitHub interactions, Cloudflare development, and more. The `gw` tool provides agent-safe defaults with safety tiers for all operations.

### Installation

Check if it's already available:
```bash
gw --help
```

If the command is not found, install the Go binary:
```bash
bash tools/grove-wrap-go/install.sh
```

This installs a single native binary to `~/.local/bin/gw` — no runtime dependencies needed.

### Key Commands

| Command | What it does | Safety |
|---------|--------------|--------|
| `gw git status` | Enhanced git status | Always safe |
| `gw git commit --write -m "..."` | Commit changes | Needs `--write` |
| `gw git push --write` | Push to remote | Needs `--write` |
| `gw git ship --write -m "..."` | Format, check, commit, push | Needs `--write` |
| `gw deploy --write` | Deploy to Cloudflare | Needs `--write` |

### Safety System

The `--write` flag is required for any operation that modifies data:
- **READ operations** (status, list, view) - Always safe, no flag needed
- **WRITE operations** (commit, push, create) - Need `--write` flag
- **DANGEROUS operations** (force push, hard reset) - Need `--write --force`

Run `gw --help` for full command list.

---

*Last updated: 2026-03-08*
*Model: Claude Opus 4.6*
