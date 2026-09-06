#!/usr/bin/env bash
# Выкладка rastudio.org на Beget.
# Сайт не оставляем мёртвым: если новая папка не вышла — перезапускаем
# то, что собралось в .output, иначе возвращаем .output-prev.
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
  # если процесс лежит, а сборка на месте — поднять
  if [ -f .output/server/index.mjs ]; then
    pm2 describe rastudio >/dev/null 2>&1 || pm2 start ecosystem.config.cjs --only rastudio --update-env || true
  fi
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

if [ -d .output ]; then
  rm -rf .output-prev
  cp -a .output .output-prev
fi

rm -rf .output-next
set +e
NITRO_PRESET=node-server NITRO_OUTPUT=.output-next npm run build:beget
BUILD=$?
set -e

start_app() {
  pm2 delete rastudio >/dev/null 2>&1 || true
  pm2 start ecosystem.config.cjs --only rastudio --update-env
  pm2 save
}

if [ -f .output-next/server/index.mjs ]; then
  pm2 stop rastudio >/dev/null 2>&1 || true
  rm -rf .output
  mv .output-next .output
  start_app
elif [ "$BUILD" -eq 0 ] && [ -f .output/server/index.mjs ]; then
  echo "[deploy] nitro собрал в .output — перезапуск"
  start_app
elif [ -f .output-prev/server/index.mjs ]; then
  echo "[deploy] сборка не вышла — возвращаю прошлую"
  rm -rf .output
  mv .output-prev .output
  start_app
  stamp
  exit 1
else
  echo "[deploy] нет ни новой, ни старой сборки"
  stamp
  exit 1
fi

rm -rf .output-prev .output-next

if ! pm2 describe rastudio-deploy >/dev/null 2>&1; then
  pm2 start ecosystem.config.cjs --only rastudio-deploy
  pm2 save
fi

stamp
echo "[deploy] live $(git rev-parse --short HEAD)"
node scripts/ping-indexnow.mjs || echo "[deploy] IndexNow skip"
