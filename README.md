# Exercise 1 — Containerizing VAULT 🐳

> **Series:** 12-Exercise DevOps Portfolio | Node/Express + React + SQLite → Docker → GHCR → k8s (coming)

## What Is VAULT?

VAULT is a self-built local social media archive viewer — **1,549 Instagram & TikTok posts**, videos, thumbnails, full metadata — built with:

- **Backend:** Node.js + Express + TypeScript
- **Frontend:** React 19 + Vite + Tailwind CSS
- **Database:** SQLite via `better-sqlite3` (native C++ module)
- **Build:** esbuild (server bundle) + Vite (frontend bundle)

The goal of Exercise 1: **containerize this real app** with a production-grade multi-stage Docker build and push the image to GitHub Container Registry (GHCR).

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  HOST (Windows/WSL)                                             │
│                                                                 │
│  hf-data/                    ──► npx tsx src/indexer.ts        │
│  (10k+ media files,               (runs on HOST, one-time)     │
│   Instagram + TikTok)              │                            │
│                                    ▼                            │
│                              vault.db (SQLite)                  │
│                              paths = absolute host paths        │
└──────────────────┬───────────────────┬──────────────────────────┘
                   │ -v mount          │ -v mount (read-only)
                   ▼                   ▼
┌─────────────────────────────────────────────────────────────────┐
│  CONTAINER  ghcr.io/zaynisthatu/vault-pipeline:v1              │
│                                                                 │
│  /app/vault.db  ◄──── reads posts, video_path, thumb_path      │
│  /mnt/d/.../hf-data  ◄── serves actual video/image files       │
│                                                                 │
│  Node.js :7860  →  Express API + React SPA                     │
│  App is STATELESS — all data is external/mounted               │
└─────────────────────────────────────────────────────────────────┘
                   │
                   ▼
         http://localhost:7860
         1,549 posts ✅ | Videos ✅ | Thumbnails ✅
```

**Key design principle:** Container owns **zero data**. DB and media are external volumes — the same pattern that becomes a PersistentVolumeClaim in Kubernetes (Exercise 2+).

---

## What Was Done

- Wrote a **multi-stage Dockerfile** (`builder` → `production`) on `node:20-slim`
- Compiled native C++ module (`better-sqlite3`) inside the image using `python3`/`make`/`g++`
- Fixed **ESM/CJS interop** issues from esbuild + `"type":"module"` in package.json
- Fixed `NODE_ENV` being baked at **build-time** by esbuild (not readable at runtime)
- Diagnosed **absolute path mismatch** between Windows-indexed DB and Linux container filesystem
- Re-indexed media files from WSL with Linux-absolute paths, mounted at identical path in container
- Tagged and pushed image to **GHCR** (`ghcr.io/zaynisthatu/vault-pipeline:v1`, `:latest`)
- Set package visibility to **Public** on GHCR (required for k3d/ArgoCD pulls without imagePullSecrets)

---

## The Real Journey — Bugs & Fixes

This exercise took multiple build iterations. Every error below was hit live and debugged from scratch.

### Bug 1 — `vite: not found` during build

```
sh: 1: vite: not found
ERROR: exit code 127
```

**Root cause:** `node:20-slim` base image has `NODE_ENV=production` set internally. `npm ci` with `NODE_ENV=production` skips `devDependencies` — and `vite` lives in devDependencies. So the build stage had no `vite` binary.

**Fix:**
```dockerfile
# builder stage
ENV NODE_ENV=development   # ← force devDeps to install
RUN npm ci
```

---

### Bug 2 — `better-sqlite3` compilation failure

```
gyp ERR! find Python  Python is not set
gyp ERR! not ok
```

**Root cause:** `better-sqlite3` is a **native C++ addon** — it must compile from source via `node-gyp`, which needs `python3`, `make`, and `g++`. None of these exist in `node:20-slim`.

**Fix:** Install build tools in **both** builder and production stages (production stage also runs `npm ci` which recompiles the native binding):

```dockerfile
RUN apt-get update && apt-get install -y python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
```

---

### Bug 3 — `module is not defined in ES module scope`

```
ReferenceError: module is not defined in ES module scope
This file is being treated as an ES module...
```

**Root cause:** esbuild outputs CommonJS format (`module.exports = ...`) but `package.json` has `"type": "module"`, which tells Node.js to treat all `.js` files as ES modules. Conflict.

**Fix:** Tell esbuild to output `.cjs` extension so Node.js treats it as CommonJS regardless of `package.json`:

```json
"build": "... esbuild ... --out-extension:.js=.cjs"
```

```dockerfile
CMD ["node", "dist/server.cjs"]
```

---

### Bug 4 — Dev server loading `/src/main.tsx` in production container

```
4:21:07 AM [vite] Pre-transform error: Failed to load url /src/main.tsx
```

**Root cause:** `server.ts` checks `process.env.NODE_ENV` at runtime to decide between Vite dev-middleware and serving the `dist/` build. But esbuild **inlines** `process.env.NODE_ENV` at build time from the builder stage environment — which was `"development"`. So the production container always ran in dev mode, trying to find `src/main.tsx` which doesn't exist in the image.

**Fix:** Explicitly define `NODE_ENV` during esbuild bundling:

```json
"build": "... esbuild ... --define:process.env.NODE_ENV=\\\"production\\\""
```

---

### Bug 5 — Videos and thumbnails 404 in container

```
GET /video/1305 → 404 Video not found
```

**Root cause:** The SQLite DB was originally indexed on Windows, storing absolute paths like:
```
D:\New folder\extraction\hf-data\11-may-2026--09-50-pm--posts\@user_video.mp4
```
Inside the Linux container, `D:\...` paths don't exist. `fs.existsSync(row.video_path)` returns `false` → 404.

**Discovery:** Checked the DB directly:
```bash
sqlite3 vault.db "SELECT video_path FROM posts LIMIT 1;"
# D:\New folder\extraction\hf-data\11-may-2026--...
```

**Fix:** Re-run the indexer from **WSL** (Linux), pointing at the media folder via its Linux/WSL path. This stores Linux-absolute paths in the DB:
```bash
npx tsx src/indexer.ts --folder "/mnt/d/New folder/extraction/hf-data"
# → 1,549 posts indexed, paths now: /mnt/d/New folder/extraction/hf-data/...
```

Then mount the media folder at the **exact same path** inside the container:
```bash
docker run \
  -v ".../vault.db:/app/vault.db" \
  -v "/mnt/d/New folder/extraction/hf-data:/mnt/d/New folder/extraction/hf-data:ro" \
  vault:v1
```

Path in DB = mount path in container → `fs.existsSync()` returns `true` → videos stream ✅

---

### Bonus — WSL environment issues

During indexer setup on WSL, two extra problems appeared:

| Problem | Cause | Fix |
|---|---|---|
| `node` command not found in WSL | Only Windows `node.exe` was on PATH via `/mnt/c/Program Files/nodejs/` | Installed Linux-native Node.js 20 via NodeSource apt repo |
| `npm install` failed with `make: not found` | WSL Ubuntu had no build tools, `better-sqlite3` needs `make`/`g++` on host too | `sudo apt-get install -y build-essential python3 make g++` |
| `npx tsx` used Windows esbuild binary | `node_modules` was copied from Windows — platform-specific binaries incompatible | `rm -rf node_modules && npm install` on Linux |

---

## Final Dockerfile

```dockerfile
# Stage 1: Build
FROM node:20-slim AS builder
WORKDIR /app

ENV NODE_ENV=development

RUN apt-get update && apt-get install -y python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# Stage 2: Production
FROM node:20-slim
WORKDIR /app

RUN apt-get update && apt-get install -y python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/index.html ./index.html

RUN echo '{"type": "commonjs"}' > ./dist/package.json

ENV NODE_ENV=production
ENV PORT=7860
EXPOSE 7860

CMD ["node", "dist/server.cjs"]
```

---

## Run Locally

**Step 1 — Index your media (one-time, run on host/WSL):**
```bash
npx tsx src/indexer.ts --folder "/your/linux/path/to/media"
```

**Step 2 — Run container with volumes:**
```bash
docker run -p 7860:7860 -e PORT=7860 \
  -v "/path/to/vault.db:/app/vault.db" \
  -v "/your/linux/path/to/media:/your/linux/path/to/media:ro" \
  ghcr.io/zaynisthatu/vault-pipeline:v1
```

> ⚠️ The media mount path **must exactly match** what was used during indexing — because DB stores absolute paths. If they differ, videos/thumbnails will 404.

**Open:** `http://localhost:7860`

---

## Image on GHCR

```
ghcr.io/zaynisthatu/vault-pipeline:v1
ghcr.io/zaynisthatu/vault-pipeline:latest
```

Public visibility — no `imagePullSecrets` needed for k3d/ArgoCD in upcoming exercises.

---

## Production Equivalents (Upcoming Exercises)

| This Exercise | Production / k8s Equivalent |
|---|---|
| `docker run -v vault.db` | PersistentVolumeClaim (Exercise 2) |
| `-v hf-data:ro` | Shared PV / object storage S3-equivalent via LocalStack (Exercise 7) |
| Manual indexer run | Kubernetes batch Job / init container |
| Single container | Deployment with HPA auto-scaling (Exercise 9) |
| Manual image push | GitHub Actions CI/CD pipeline (Exercise 11) |

---

## Key Learnings

1. **Native modules in Docker** — `better-sqlite3`, `canvas`, `sharp` etc. all need build tools (`python3`/`make`/`g++`) in the image. `node:slim` saves size but requires explicit installation.

2. **ESM/CJS in bundled Node apps** — esbuild CJS output + `"type":"module"` = silent conflict. Use `--out-extension:.js=.cjs` or set `"type":"commonjs"` in the output directory.

3. **Build-time vs runtime environment** — esbuild inlines `process.env` values at bundle time. If your builder runs in `NODE_ENV=development`, that string gets baked into the bundle. Always use `--define` to explicitly set values for production bundles.

4. **Stateless containers + external data** — the container should own zero persistent state. DB and media as mounted volumes means the same image runs anywhere — laptop, VM, k8s pod — just with different volume sources. This is the foundation of everything in Exercises 2–12.

5. **Path portability** — indexing on Windows creates `D:\...` paths that break on Linux. Always index from the same OS/environment that will run the container, and mount media at the exact indexed path.
