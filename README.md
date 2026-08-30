# VAULT — DevOps Pipeline

![Docker](https://img.shields.io/badge/Docker-2496ED?style=flat&logo=docker&logoColor=white)
![Kubernetes](https://img.shields.io/badge/Kubernetes-326CE5?style=flat&logo=kubernetes&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-20-339933?style=flat&logo=node.js&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat&logo=typescript&logoColor=white)
![GHCR](https://img.shields.io/badge/GHCR-vault--pipeline-181717?style=flat&logo=github&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-green?style=flat)

A full-stack social media archive viewer containerized and deployed through a production-grade DevOps pipeline — multi-stage Docker builds, Kubernetes orchestration, GitOps, observability, autoscaling, and CI/CD.

---

## Highlights

- ✅ Multi-stage Docker build on `node:20-slim` — native C++ module (`better-sqlite3`) compiled at build time
- ✅ Stateless container architecture — DB and media externalized as volumes (PersistentVolumeClaim-ready)
- ✅ Image published to GHCR
- ✅ ESM/CJS interop resolved — esbuild CJS output with `"type":"module"` package
- ✅ 3-node k3d Kubernetes cluster — 2 replicas behind a Traefik Ingress at `vault.local`
- ✅ Health checks decoupled from application state — dedicated `/healthz` probe, no CrashLoopBackOff
- ✅ NetworkPolicy and PodDisruptionBudget (`minAvailable: 1`) applied
- ✅ Runtime-validated — video streaming, thumbnails, and post search live under load

---

## Quick Start

```bash
# 1. Index your media (one-time, run on host/WSL)
npx tsx src/indexer.ts --folder "/your/linux/path/to/media"

# 2a. Run standalone (Stage 1)
docker run -p 7860:7860 -e PORT=7860 \
  -v "/path/to/vault.db:/app/vault.db" \
  -v "/your/media:/your/media:ro" \
  ghcr.io/zaynisthatu/vault-pipeline:latest

# 2b. Run on Kubernetes (Stage 2)
kubectl apply -f k8s/
kubectl get pods -n vault
# add "127.0.0.1  vault.local" to /etc/hosts, then:
curl http://vault.local/healthz

# 3. Open http://localhost:7860 (standalone) or http://vault.local (k8s)
```

---

## What Is VAULT?

VAULT is a self-built local archive viewer for Instagram and TikTok content — full video streaming, thumbnails, metadata search.

| Layer | Technology |
|-------|-----------|
| Backend | Node.js + Express + TypeScript |
| Frontend | React 19 + Vite + Tailwind CSS v4 |
| Database | SQLite via `better-sqlite3` (native C++ addon) |
| Bundler | esbuild (server) + Vite (frontend) |
| Registry | GHCR — `ghcr.io/zaynisthatu/vault-pipeline` |
| Orchestration | k3d (3-node) — Traefik Ingress, NetworkPolicy, PodDisruptionBudget |

---

## Architecture

```mermaid
flowchart TD
    subgraph HOST ["Host - WSL Ubuntu"]
        SRC["Source Code - Node React SQLite"]
        MEDIA["hf-data - 10k+ media files"]
        IDX["Indexer - npx tsx src/indexer.ts"]
        DB[("vault.db - 1549 posts - Linux paths")]
        MEDIA --> IDX --> DB
    end

    subgraph BUILD ["Multi-Stage Docker Build"]
        B1["Stage 1 - Builder - node:20-slim - npm ci - vite build - esbuild"]
        B2["Stage 2 - Production - node:20-slim - npm ci omit-dev - copy dist only"]
        B1 --> B2
    end

    SRC --> BUILD
    B2 --> IMG["Image vault:v1"]
    IMG --> GHCR["GHCR - ghcr.io/zaynisthatu/vault-pipeline:latest"]

    subgraph CONTAINER ["Running Container - port 7860"]
        APP["Express + React - Stateless"]
        APP --> MDB["/app/vault.db"]
        APP --> MMEDIA["media read-only"]
    end

    GHCR -->|docker run| CONTAINER
    DB -.->|volume mount| MDB
    MEDIA -.->|volume mount| MMEDIA
    CONTAINER --> LIVE["localhost:7860 - 1549 posts - videos - thumbnails"]
```

---

## Screenshots

### App — Live at localhost:7860
![App Running](docs/images/app-live.png)

### Container Running
![Docker PS](docs/images/docker-ps.png)

### GHCR — Image Published
![GHCR](docs/images/ghcr-published.png)

### Docker Build — Success
![Docker Build](docs/images/docker-build.png)

### Indexer Output
![Indexer Output](docs/images/indexer-output.png)

---

## Pipeline Stages

| Stage | Focus | Status |
|-------|-------|--------|
| **1 — Containerization** | Multi-stage Docker build · GHCR push · stateless architecture | ✅ Complete |
| **2 — Kubernetes** | 3-node k3d cluster · Traefik Ingress · NetworkPolicy · PodDisruptionBudget | ✅ Complete |
| 3 — GitOps | ArgoCD · declarative sync · auto-deploy on git push | ⏳ |
| 4 — Reliability | Rolling updates · rollback · zero-downtime deploy | ⏳ |
| 5 — Observability | Prometheus · Grafana · Loki | ⏳ |
| 6 — Alerting | Slack webhook · alert rules | ⏳ |
| 7 — Storage | LocalStack S3 · media backend abstraction | ⏳ |
| 8 — Config Mgmt | Ansible · automated environment setup | ⏳ |
| 9 — Autoscaling | HPA · load testing · scale events | ⏳ |
| 10 — CI/CD | GitHub Actions · automated build + push + deploy | ⏳ |
| 11 — Secrets | Sealed Secrets · encrypted at rest in git | ⏳ |
| 12 — Security | Trivy · image vulnerability scanning | ⏳ |

---

## Documentation

- [Stage 1 — Containerization](docs/stage-1-containerization.md)
- [Stage 2 — Kubernetes Orchestration](docs/stage-2-kubernetes.md)

---

## License

MIT