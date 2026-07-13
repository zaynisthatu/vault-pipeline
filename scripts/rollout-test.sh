#!/usr/bin/env bash
# rollout-test.sh — hits /healthz continuously to prove zero dropped
# requests during a rolling update. Run this in one terminal BEFORE
# triggering the rollout (git push / ArgoCD sync) in another.
#
# Usage:
#   ./scripts/rollout-test.sh [url] [interval_seconds]
#
# Example:
#   ./scripts/rollout-test.sh http://vault.local/healthz 0.2
#
# Stop with Ctrl+C — it prints a summary on exit.

URL="${1:-http://vault.local/healthz}"
INTERVAL="${2:-0.2}"

TOTAL=0
FAIL=0
LOGFILE="rollout-test-$(date +%Y%m%d-%H%M%S).log"

echo "Hitting $URL every ${INTERVAL}s — logging to $LOGFILE"
echo "Press Ctrl+C to stop and see summary."
echo ""

cleanup() {
  echo ""
  echo "════════════════════════════════════════"
  echo " ROLLOUT TEST SUMMARY"
  echo "════════════════════════════════════════"
  echo " Total requests : $TOTAL"
  echo " Non-200 count  : $FAIL"
  if [ "$FAIL" -eq 0 ]; then
    echo " Result         : ZERO DOWNTIME CONFIRMED ✔"
  else
    echo " Result         : DROPPED REQUESTS DETECTED ✘"
  fi
  echo " Full log       : $LOGFILE"
  echo "════════════════════════════════════════"
  exit 0
}
trap cleanup INT TERM

while true; do
  TS="$(date '+%H:%M:%S.%3N')"
  CODE="$(curl -s -o /dev/null -w "%{http_code}" --max-time 2 "$URL")"
  TOTAL=$((TOTAL+1))

  if [ "$CODE" != "200" ]; then
    FAIL=$((FAIL+1))
    echo "[$TS] FAIL — HTTP $CODE" | tee -a "$LOGFILE"
  else
    echo "[$TS] OK   — HTTP $CODE" >> "$LOGFILE"
  fi

  # lightweight live counter, overwritten in place
  printf "\rrequests: %-6s failures: %-4s" "$TOTAL" "$FAIL"

  sleep "$INTERVAL"
done