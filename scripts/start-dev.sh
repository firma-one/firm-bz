#!/usr/bin/env bash
#
# Dev environment startup sequence.
# Runs each stage in order, waits for it to succeed, and stops immediately
# (without continuing to the next stage) if a stage fails.
#
# Usage: ./scripts/start-dev.sh

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

step_num=0

log_stage() {
  step_num=$((step_num + 1))
  echo -e "\n${YELLOW}==> [Stage ${step_num}] $1${NC}"
}

log_ok() {
  echo -e "${GREEN}✔ $1${NC}"
}

fail_and_stop() {
  echo -e "${RED}✘ Stage ${step_num} failed: $1${NC}"
  echo -e "${RED}Stopping startup sequence. Fix the issue above before re-running.${NC}"
  exit 1
}

# --- Stage 1: cd frontend ------------------------------------------------------
log_stage "Entering frontend directory"
cd "$REPO_ROOT/frontend" || fail_and_stop "could not cd into $REPO_ROOT/frontend"
log_ok "in $(pwd)"

# --- Stage 2: tailscale funnel ------------------------------------------------
# Runs in the background since it's a long-lived tunnel process; we just
# confirm it started without immediately erroring out.
log_stage "Starting tailscale funnel on localhost:3000"
EXISTING_FUNNEL_PID="$(pgrep -f 'tailscale funnel localhost:3000' | head -n1 || true)"
if [ -n "$EXISTING_FUNNEL_PID" ]; then
  log_ok "tailscale funnel already running (pid $EXISTING_FUNNEL_PID), skipping"
  TAILSCALE_PID=""
else
  tailscale funnel localhost:3000 > /tmp/tailscale-funnel.log 2>&1 &
  TAILSCALE_PID=$!
  sleep 3
  if ! kill -0 "$TAILSCALE_PID" 2>/dev/null; then
    if grep -qi 'listener already exists' /tmp/tailscale-funnel.log; then
      log_ok "tailscale funnel already active on port 443 (untracked process), continuing"
      TAILSCALE_PID=""
    else
      cat /tmp/tailscale-funnel.log
      fail_and_stop "tailscale funnel exited immediately (see log above)"
    fi
  else
    log_ok "tailscale funnel running (pid $TAILSCALE_PID), log: /tmp/tailscale-funnel.log"
  fi
fi

# --- Stage 3: npm run inngest:dev ---------------------------------------------
# Long-lived dev process; start in background and verify it's still alive
# after a few seconds instead of waiting for it to exit.
log_stage "Starting npm run inngest:dev"
EXISTING_INNGEST_PID="$(pgrep -f 'inngest-cli.*dev' | head -n1 || true)"
if [ -n "$EXISTING_INNGEST_PID" ]; then
  log_ok "inngest:dev already running (pid $EXISTING_INNGEST_PID), skipping"
  INNGEST_PID="$EXISTING_INNGEST_PID"
else
  npm run inngest:dev > /tmp/inngest-dev.log 2>&1 &
  INNGEST_PID=$!
  sleep 5
  if ! kill -0 "$INNGEST_PID" 2>/dev/null; then
    cat /tmp/inngest-dev.log
    fail_and_stop "inngest:dev exited immediately (see log above)"
  fi
  log_ok "inngest:dev running (pid $INNGEST_PID), log: /tmp/inngest-dev.log"
fi

# --- Stage 4: npx supabase stop -----------------------------------------------
log_stage "Stopping any running supabase instance"
if npx supabase stop; then
  log_ok "supabase stopped"
else
  fail_and_stop "npx supabase stop failed"
fi

# --- Stage 5: npx supabase start ----------------------------------------------
log_stage "Starting supabase"
if npx supabase start; then
  log_ok "supabase started"
else
  fail_and_stop "npx supabase start failed"
fi

# --- Stage 6: rm -rf .next && npm run build -----------------------------------
log_stage "Stopping any running Next.js dev/start server and freeing port 3000"
NEXT_SERVER_PIDS="$(pgrep -f 'next dev|next start' || true)"
PORT_PIDS="$(lsof -ti tcp:3000 || true)"
ALL_PIDS="$(printf '%s\n%s\n' "$NEXT_SERVER_PIDS" "$PORT_PIDS" | grep -E '^[0-9]+$' | sort -u || true)"

if [ -n "$ALL_PIDS" ]; then
  echo "$ALL_PIDS" | xargs kill
  sleep 1
  STILL_RUNNING="$(printf '%s\n%s\n' "$(pgrep -f 'next dev|next start' || true)" "$(lsof -ti tcp:3000 || true)" | grep -E '^[0-9]+$' | sort -u || true)"
  if [ -n "$STILL_RUNNING" ]; then
    echo "$STILL_RUNNING" | xargs kill -9
    sleep 1
  fi
  FINAL_CHECK="$(lsof -ti tcp:3000 || true)"
  if [ -n "$FINAL_CHECK" ]; then
    fail_and_stop "port 3000 still occupied by pid(s) $FINAL_CHECK after kill -9"
  fi
  log_ok "stopped Next.js server / freed port 3000 (pid(s): $(echo "$ALL_PIDS" | xargs))"
else
  log_ok "no Next.js dev/start server running and port 3000 already free"
fi

log_stage "Cleaning .next and running production build"
if rm -rf .next; then
  log_ok ".next removed"
else
  fail_and_stop "failed to remove .next"
fi

if npm run build; then
  log_ok "npm run build succeeded"
else
  fail_and_stop "npm run build failed"
fi

echo -e "\n${GREEN}All stages completed successfully.${NC}"
echo "Background processes still running:"
if [ -n "$TAILSCALE_PID" ]; then
  echo "  tailscale funnel: pid $TAILSCALE_PID (log: /tmp/tailscale-funnel.log)"
else
  echo "  tailscale funnel: pre-existing instance (not started by this script)"
fi
echo "  inngest:dev:      pid $INNGEST_PID (log: /tmp/inngest-dev.log)"
