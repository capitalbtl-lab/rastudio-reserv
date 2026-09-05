#!/bin/sh
set -eu
cd /workspace
PIDFILE=/tmp/watch-push.pid
if [ -f "$PIDFILE" ] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then
  :
else
  node scripts/watch-push.mjs >>/tmp/watch-push.log 2>&1 &
  echo $! > "$PIDFILE"
fi
node scripts/preview.mjs stop || true
if curl -sf -o /dev/null --max-time 2 http://127.0.0.1:8080/; then
  exit 0
fi
npm run dev >>/tmp/app-startup.log 2>&1 &
