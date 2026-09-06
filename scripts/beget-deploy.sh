#!/usr/bin/env bash
# Выкладка rastudio.org на Beget.
# Сборка в .output-next, пока старый процесс ещё отдаёт сайт.
# Стоп — только на секунды, чтобы поменять папки.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

LOCK=/tmp/rastudio-deploy.lock
exec 9>"$LOCK"
if ! flock -n 9; then
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
mkdir -p data
stamp() {
  printf '{"sha":"%s","at":"%s"%s}\n' "$(git rev-parse --short HEAD 2>/dev/null || echo unknown)" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "${1:-}" > data/build.json
}
stamp ',"deploying":true'
git reset --hard origin/main

if [ ! -d node_modules ] || ! git diff --quiet "$BEFORE" HEAD -- package-lock.json 2>/dev/null; then
  npm ci
fi

rm -rf .output-next
NITRO_PRESET=node-server NITRO_OUTPUT=.output-next npm run build:beget
if [ ! -f .output-next/server/index.mjs ]; then
  echo "[deploy] сборка не дала .output-next — сайт не трогаем"
  stamp
  exit 1
fi

pm2 stop rastudio >/dev/null 2>&1 || true
rm -rf .output-prev
if [ -d .output ]; then mv .output .output-prev; fi
mv .output-next .output
pm2 delete rastudio >/dev/null 2>&1 || true
if ! pm2 start ecosystem.config.cjs --only rastudio --update-env; then
  echo "[deploy] старт не удался, возвращаю прошлую сборку"
  rm -rf .output
  if [ -d .output-prev ]; then mv .output-prev .output; fi
  pm2 start ecosystem.config.cjs --only rastudio --update-env || true
  stamp
  exit 1
fi
pm2 save
rm -rf .output-prev

if ! pm2 describe rastudio-deploy >/dev/null 2>&1; then
  pm2 start ecosystem.config.cjs --only rastudio-deploy
  pm2 save
fi

stamp
echo "[deploy] live $(git rev-parse --short HEAD)"
node scripts/ping-indexnow.mjs || echo "[deploy] IndexNow skip"
