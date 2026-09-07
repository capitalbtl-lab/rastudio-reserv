#!/usr/bin/env bash
# Выкладка rastudio.org на Beget.
# Сборка в .output-next. Живой процесс не трогаем, пока index.mjs не готов.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

LOCK=/tmp/rastudio-deploy.lock
if [ -f "$LOCK" ]; then
  age=$(( $(date +%s) - $(stat -c %Y "$LOCK" 2>/dev/null || echo 0) ))
  if [ "$age" -gt 720 ]; then
    echo "[deploy] снимаю зависший lock (${age}s)"
    rm -f "$LOCK"
  fi
fi
exec 9>"$LOCK"
if ! flock -w 15 9; then
  echo "[deploy] уже идёт"
  exit 0
fi

git fetch origin main
BEFORE="$(git rev-parse HEAD)"
AFTER="$(git rev-parse origin/main)"
if [ "${1:-}" != "--force" ] && [ "$BEFORE" = "$AFTER" ]; then
  echo "[deploy] уже актуально $(git rev-parse --short HEAD)"
  exit 0
fi

echo "[deploy] ${BEFORE:0:7} → ${AFTER:0:7}"
git reset --hard origin/main

if [ ! -d node_modules ] || ! git diff --quiet "$BEFORE" HEAD -- package-lock.json 2>/dev/null; then
  npm ci
fi

rm -rf .output-next
NITRO_OUTPUT=.output-next npm run build:beget
if [ ! -f .output-next/server/index.mjs ]; then
  echo "[deploy] нет .output-next/server/index.mjs — живой процесс не трогаю"
  exit 1
fi

pm2 stop rastudio >/dev/null 2>&1 || true
if [ -d .output ]; then
  rm -rf .output.bak
  mv .output .output.bak
fi
mv .output-next .output
rm -rf .output.bak

pm2 delete rastudio >/dev/null 2>&1 || true
pm2 start ecosystem.config.cjs --only rastudio

for app in rastudio-deploy rastudio-night-groups rastudio-pay-poll; do
  if ! pm2 describe "$app" >/dev/null 2>&1; then
    pm2 start ecosystem.config.cjs --only "$app"
  fi
done
pm2 save

echo "[deploy] live $(git rev-parse --short HEAD)"
node scripts/ping-indexnow.mjs || echo "[deploy] IndexNow skip"
