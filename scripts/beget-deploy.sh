#!/usr/bin/env bash
# Выкладка rastudio.org на Beget.
# Сборка только в .output (Nitro прописывает этот путь в сервер и public).
# Сначала стоп rastudio — иначе чанки CSS/JS пишутся поверх живого процесса.
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
if [ "${RA_DEPLOY_REEXEC:-}" != "1" ]; then
  export RA_DEPLOY_REEXEC=1
  exec bash "$ROOT/scripts/beget-deploy.sh" --force
fi

if [ ! -d node_modules ] || ! git diff --quiet "$BEFORE" HEAD -- package-lock.json 2>/dev/null; then
  npm ci
fi

pm2 stop rastudio >/dev/null 2>&1 || true
if [ -d .output ]; then
  rm -rf .output.bak
  mv .output .output.bak
fi
rm -rf .output-next

npm run build:beget
css="$(ls .output/public/assets/*.css 2>/dev/null | head -1 || true)"
if [ ! -f .output/server/index.mjs ] || [ -z "$css" ]; then
  echo "[deploy] сборка без index.mjs или CSS — возвращаю предыдущую"
  rm -rf .output
  if [ -d .output.bak ]; then mv .output.bak .output; fi
  pm2 start ecosystem.config.cjs --only rastudio >/dev/null 2>&1 || pm2 restart rastudio --update-env || true
  exit 1
fi
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
