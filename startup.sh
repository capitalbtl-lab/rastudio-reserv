#!/bin/sh
set -eu
cd /workspace
if ! pgrep -f "scripts/watch-push.mjs" >/dev/null 2>&1; then
  node scripts/watch-push.mjs >>/tmp/watch-push.log 2>&1 &
fi
node scripts/preview.mjs stop || true
if curl -sf -o /dev/null --max-time 2 http://127.0.0.1:8080/; then
  exit 0
fi
npm run dev >>/tmp/app-startup.log 2>&1 &
