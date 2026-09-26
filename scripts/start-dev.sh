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
# Always stop any existing funnel and start a fresh one, rather than trying to
# detect a healthy one and reuse it.
#
# The funnel's serve config is ephemeral and daemon-level, shared by every
# funnel session: Ctrl+C in any one of them, or a tailscaled restart/upgrade,
# tears the config down while leaving the client process alive. Such a process
# looks perfectly healthy to pgrep and serves nothing, so "is it running?" is
# the wrong question. Restarting is fast and idempotent - just take a clean one.
log_stage "Starting tailscale funnel on localhost:3000"

# True only when the daemon actually has a funnel config proxying to port 3000.
#
# Must read the JSON, not `tailscale funnel status`. A funnel started as
# `tailscale funnel <target>` is a FOREGROUND session, which lives under
# .Foreground in the serve config; the text view only renders the background
# config and prints "No serve config" even while the funnel is live.
funnel_is_serving() {
  local json
  json="$(tailscale serve status --json 2>/dev/null)" || return 1
  printf '%s' "$json" | grep -q '"AllowFunnel"' || return 1
  printf '%s' "$json" \
    | grep -Eq '"Proxy"[[:space:]]*:[[:space:]]*"http://(localhost|127\.0\.0\.1):3000"'
}

EXISTING_FUNNEL_PIDS="$(pgrep -f 'tailscale funnel localhost:3000' || true)"
if [ -n "$EXISTING_FUNNEL_PIDS" ]; then
  echo "  stopping existing funnel process(es): $(echo "$EXISTING_FUNNEL_PIDS" | xargs)"
  echo "$EXISTING_FUNNEL_PIDS" | xargs kill 2>/dev/null || true
  sleep 1
  STILL_RUNNING="$(pgrep -f 'tailscale funnel localhost:3000' || true)"
  if [ -n "$STILL_RUNNING" ]; then
    echo "$STILL_RUNNING" | xargs kill -9 2>/dev/null || true
    sleep 1
  fi
fi

tailscale funnel localhost:3000 > /tmp/tailscale-funnel.log 2>&1 &
TAILSCALE_PID=$!
sleep 3
if ! kill -0 "$TAILSCALE_PID" 2>/dev/null; then
  cat /tmp/tailscale-funnel.log
  fail_and_stop "tailscale funnel exited immediately (see log above)"
fi
# Alive is necessary but not sufficient - confirm the config actually landed.
if ! funnel_is_serving; then
  cat /tmp/tailscale-funnel.log
  fail_and_stop "tailscale funnel process started (pid $TAILSCALE_PID) but no serve config is active"
fi
log_ok "tailscale funnel serving (pid $TAILSCALE_PID), log: /tmp/tailscale-funnel.log"

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
echo "  tailscale funnel: pid $TAILSCALE_PID (log: /tmp/tailscale-funnel.log)"
echo "  inngest:dev:      pid $INNGEST_PID (log: /tmp/inngest-dev.log)"
