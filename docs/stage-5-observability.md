# Stage 5 — Observability Stack (Prometheus, Grafana, Loki)

**Status: ⚠️ IN PROGRESS — not complete.** The working VM was destroyed mid-Step 7
before the last two items were verified. This doc reflects the real state, not a
target state — nothing below is marked done unless there's a screenshot or log to
back it.

**Objective:** Give VAULT a full observability stack — Prometheus metrics, structured
logs, Grafana dashboards, ServiceMonitor-based scrape discovery, and alerting rules —
deployed the same GitOps way as everything since Stage 3 (ArgoCD-managed Helm charts,
no manual `kubectl apply`).

---

## Step-by-step status

| Step | What | Status |
|---|---|---|
| 1 | `prom-client` metrics instrumentation in `server.ts`, image v3 build/push | ✅ Complete — build/push + ArgoCD rollout screenshotted |
| 2 | Structured JSON logging, image v4 (bugfix) → v5 | ⚠️ Partial — code committed, ArgoCD shows the v5 rollout, but the `docker build -t v5` / `docker push v5` terminal output was never captured before the VM died |
| 3 | `kube-prometheus-stack` (Prometheus + Grafana + Alertmanager) via Helm/ArgoCD | ⚠️ Deployed and running, with an unresolved incident: Prometheus OOMKilled 3× on the default 512Mi limit. A 1Gi limit was prepared, but its commit/push and a post-fix stability check were not completed before the VM was destroyed |
| 4 | `loki-stack` (Loki + Promtail) via Helm/ArgoCD | ✅ Deployed — Loki and Promtail pods Running with 0 restarts in the screenshots (log delivery itself is unverified, see Step 7) |
| 5 | ServiceMonitor CRD — label-based scrape discovery | ✅ Complete — targets went from 0/2 UP to 2/2 UP after a NetworkPolicy fix |
| 6 | PrometheusRule CRD — alerting | ✅ Complete — `VaultHighErrorRate` and `VaultPodDown` confirmed loaded in the Alerts page |
| 7 | Grafana + Loki Explore query verification | ❌ Not resolved — `{namespace="vault"}` failed with a parse error (`unexpected IDENTIFIER`), never successfully retried |
| 8 | Full end-to-end verify, everything stable at once | ❌ Not done — blocked on Step 7 |
| 9 | Docs / LinkedIn post / CV bullet | ❌ Not started — intentionally, only after 1–3 above are actually done |

---

## What actually happened, in order

1. Added `prom-client` instrumentation to `server.ts`. Hit a bug: `/healthz` was
   registered *before* the metrics middleware, so it bypassed instrumentation
   entirely — moved the middleware earlier in the Express chain to fix it.
2. Added a structured JSON logging helper.
3. Discovered a missing `.dockerignore` — without it, local `node_modules` was
   being copied into the image and overwriting the container-installed
   dependencies, breaking the `vite build`. Added `.dockerignore`, rebuilt.
4. Deployed `kube-prometheus-stack` and `loki-stack` as ArgoCD Applications
   (multi-source Helm configuration, same app-of-apps pattern as Stage 3).
5. Prometheus crashed with OOMKilled 3 times on the default 512Mi memory limit.
   A 1Gi limit was prepared, but the commit/push and a verification run were not
   completed before the VM was destroyed — **this fix is unverified.**
6. ServiceMonitor targets showed DOWN with "connection refused." Root cause:
   NetworkPolicy (from Stage 2) didn't allow ingress from the `monitoring`
   namespace. Added an explicit allow rule on port 7860 for Prometheus scraping —
   targets went 0/2 → 2/2 UP.
7. PrometheusRule applied — both alert rules confirmed loaded in the Prometheus
   Alerts UI.
8. Attempted the Loki Explore query in Grafana to confirm log delivery —
   `{namespace="vault"}` threw a parse error. Not fixed before the VM (ephemeral
   by design, destroyed every session) was torn down.

---

## Known gaps (carried forward, not hidden)

- **No `docker build -t v5` / `docker push v5` screenshot evidence** — the v5 image
  rollout is visible in ArgoCD and the code is committed, but the actual build/push
  step for that specific tag was never captured.
- **Loki query unresolved** — log delivery into Loki has not been confirmed working
  end-to-end; the one verification attempt failed and wasn't retried.
- **No final stable-state verification** — Steps 1–6 are each individually
  confirmed, but there's no single screenshot/session showing all of them healthy
  at the same time.
- **This doc, the LinkedIn post, and the CV bullet are all being written before
  that final verification** — by design, none of those get finalized until Steps
  7–8 are actually done. Treat this file as a status snapshot, not a completion
  claim.

## Local vs Production Equivalents

| Aspect | This Setup | Production Equivalent |
|---|---|---|
| Metrics | Prometheus (kube-prometheus-stack via Helm) | Same — or managed (AWS Managed Prometheus) |
| Dashboards | Grafana (bundled in kube-prometheus-stack) | Same, or Grafana Cloud |
| Logs | Loki + Promtail | Same, or CloudWatch Logs / Datadog |
| Alerting | PrometheusRule + Alertmanager | Same |
| Scrape discovery | ServiceMonitor CRD (label-based) | Same — portable as-is to any Prometheus Operator cluster |

---

## What's next (before this stage can be marked ✅ Complete)

1. Redo Step 7 — get a working Loki Explore query result.
2. Capture the missing v5 build/push screenshots (or re-push v5 in a fresh session
   and capture it then).
3. One full end-to-end verify pass with metrics, logs, and alerts all confirmed
   stable in the same session.
4. Only then: finalize this doc, the LinkedIn post, and the CV bullet.

---

## Evidence — Screenshots

Organized by the step they support.

| Folder | Screenshot | What it shows |
|---|---|---|
| 01_prometheus_metrics_endpoint | 01_docker_build_v3.png | `docker build` for the `prom-client`-instrumented v3 image |
| | 02_docker_push_v3.png | v3 pushed to GHCR |
| | 03_v3_argocd_rollout.png | ArgoCD rollout of v3 |
| 02_structured_logging_v5_rollout | 01_v4_rollout_argocd.png | v4 (bugfix) rollout in ArgoCD |
| | 02_v5_rollout_argocd.png | v5 (structured logging) rollout in ArgoCD |
| | 03_git_pull_vm.png | `git pull` on the VM picking up the v5 deployment change |
| | 04_pods_rollout.png | Pods rolling to v5 |
| | 05_requests_capture_metrics.png | Requests hitting the app, metrics being captured |
| 04_loki_promtail_install | 01_kubectl_get_pods_monitoring_oomkilled_3_restarts.png | **Prometheus pod, 3 restarts — OOMKilled on the default 512Mi limit** |
| | 02_kubectl_get_pods_monitoring_early_snapshot_0restarts_pre_crashloop.png | Earlier snapshot of the same cluster: every pod's age is ~82 min lower than in 01, so it was taken *before* the crash loop. **Not evidence of a fix.** |
| 05_servicemonitor_verification | 01 | ArgoCD `kube-prometheus-stack` app view (OutOfSync / Sync failed at that moment), not a NetworkPolicy manifest |
| | 02–04, 06 | Full Prometheus Targets page captures (the vault pool is not visible in the captured region; the `0/2 up` state and the `connection refused` errors for 10.42.1.14:7860 and 10.42.2.12:7860 are recorded in the session chat) |
| | 05 | `serviceMonitor/monitoring/vault-servicemonitor/0 (2/2 up)` — same two IPs, after the NetworkPolicy fix |
| 06_prometheusrule_alerts | 01–02 | `VaultHighErrorRate` / `VaultPodDown` alert rules loaded, Alertmanager targets up |
| 07_argocd_sync_states | 01–05 | All 4 ArgoCD apps (app-of-apps, kube-prometheus-stack, loki-stack, vault-app) reaching Synced/Healthy |
| 08_troubleshooting_evidence | 01–04 | Real sync failures encountered along the way (kept, not hidden) |
| 09_grafana_loki_query_incomplete | 01_..._UNRESOLVED.png | **The unresolved Loki Explore parse error — Step 7, still open** |

### Screenshots

#### 01_prometheus_metrics_endpoint

![01_prometheus_metrics_endpoint / 01_docker_build_v3.png](images/stage-5/01_prometheus_metrics_endpoint/01_docker_build_v3.png)

![01_prometheus_metrics_endpoint / 02_docker_push_v3.png](images/stage-5/01_prometheus_metrics_endpoint/02_docker_push_v3.png)

![01_prometheus_metrics_endpoint / 03_v3_argocd_rollout.png](images/stage-5/01_prometheus_metrics_endpoint/03_v3_argocd_rollout.png)

#### 02_structured_logging_v5_rollout

![02_structured_logging_v5_rollout / 01_v4_rollout_argocd.png](images/stage-5/02_structured_logging_v5_rollout/01_v4_rollout_argocd.png)

![02_structured_logging_v5_rollout / 02_v5_rollout_argocd.png](images/stage-5/02_structured_logging_v5_rollout/02_v5_rollout_argocd.png)

![02_structured_logging_v5_rollout / 03_git_pull_vm.png](images/stage-5/02_structured_logging_v5_rollout/03_git_pull_vm.png)

![02_structured_logging_v5_rollout / 04_pods_rollout.png](images/stage-5/02_structured_logging_v5_rollout/04_pods_rollout.png)

![02_structured_logging_v5_rollout / 05_requests_capture_metrics.png](images/stage-5/02_structured_logging_v5_rollout/05_requests_capture_metrics.png)

#### 04_loki_promtail_install

![04_loki_promtail_install / 01_kubectl_get_pods_monitoring_oomkilled_3_restarts.png](images/stage-5/04_loki_promtail_install/01_kubectl_get_pods_monitoring_oomkilled_3_restarts.png)

![04_loki_promtail_install / 02_kubectl_get_pods_monitoring_early_snapshot_0restarts_pre_crashloop.png](images/stage-5/04_loki_promtail_install/02_kubectl_get_pods_monitoring_early_snapshot_0restarts_pre_crashloop.png)

#### 05_servicemonitor_verification

![05_servicemonitor_verification / 01_argocd_kube_prometheus_stack_sync_failed.png](images/stage-5/05_servicemonitor_verification/01_argocd_kube_prometheus_stack_sync_failed.png)

![05_servicemonitor_verification / 02_targets_0of2_up_before_networkpolicy_fix.png](images/stage-5/05_servicemonitor_verification/02_targets_0of2_up_before_networkpolicy_fix.png)

![05_servicemonitor_verification / 03_targets_page_state.png](images/stage-5/05_servicemonitor_verification/03_targets_page_state.png)

![05_servicemonitor_verification / 04_targets_page_state.png](images/stage-5/05_servicemonitor_verification/04_targets_page_state.png)

![05_servicemonitor_verification / 05_targets_2of2_up_after_networkpolicy_fix.png](images/stage-5/05_servicemonitor_verification/05_targets_2of2_up_after_networkpolicy_fix.png)

![05_servicemonitor_verification / 06_full_targets_page_all_scrape_pools.png](images/stage-5/05_servicemonitor_verification/06_full_targets_page_all_scrape_pools.png)

#### 06_prometheusrule_alerts

![06_prometheusrule_alerts / 01_prometheus_alerts_page_vaulthighrror_vaultpoddown_loaded.png](images/stage-5/06_prometheusrule_alerts/01_prometheus_alerts_page_vaulthighrror_vaultpoddown_loaded.png)

![06_prometheusrule_alerts / 02_alertmanager_servicemonitor_targets_up.png](images/stage-5/06_prometheusrule_alerts/02_alertmanager_servicemonitor_targets_up.png)

#### 07_argocd_sync_states

![07_argocd_sync_states / 01_kube-prometheus-stack_progressing_syncing.jpg](images/stage-5/07_argocd_sync_states/01_kube-prometheus-stack_progressing_syncing.jpg)

![07_argocd_sync_states / 02_all_4_apps_kube-prometheus-stack_still_syncing.png](images/stage-5/07_argocd_sync_states/02_all_4_apps_kube-prometheus-stack_still_syncing.png)

![07_argocd_sync_states / 03_all_4_apps_healthy_synced.png](images/stage-5/07_argocd_sync_states/03_all_4_apps_healthy_synced.png)

![07_argocd_sync_states / 04_all_4_apps_state.png](images/stage-5/07_argocd_sync_states/04_all_4_apps_state.png)

![07_argocd_sync_states / 05_all_4_apps_state.png](images/stage-5/07_argocd_sync_states/05_all_4_apps_state.png)

#### 08_troubleshooting_evidence

![08_troubleshooting_evidence / 01_kube-prometheus-stack_sync_failed_1error.png](images/stage-5/08_troubleshooting_evidence/01_kube-prometheus-stack_sync_failed_1error.png)

![08_troubleshooting_evidence / 02_port_forward_argocd_ui.png](images/stage-5/08_troubleshooting_evidence/02_port_forward_argocd_ui.png)

![08_troubleshooting_evidence / 03_argocd_apps_tiles_view.png](images/stage-5/08_troubleshooting_evidence/03_argocd_apps_tiles_view.png)

![08_troubleshooting_evidence / 04_argocd_apps_error_state.png](images/stage-5/08_troubleshooting_evidence/04_argocd_apps_error_state.png)

#### 09_grafana_loki_query_incomplete

![09_grafana_loki_query_incomplete / 01_loki_explore_parse_error_UNRESOLVED.png](images/stage-5/09_grafana_loki_query_incomplete/01_loki_explore_parse_error_UNRESOLVED.png)
