#!/usr/bin/env bash
# Выкладка rastudio.org: сборка в /var/www/rastudio-next.
# Живой .output не трогаем, пока новая сборка не готова.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
BUILD=/var/www/rastudio-next

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

mkdir -p "$BUILD"
rsync -a --delete \
  --exclude '/.output/' \
  --exclude '/.output-next/' \
  --exclude '/.output-prev/' \
  --exclude '/node_modules/' \
  --exclude '/storage/backups/' \
  --exclude '/.git/' \
  "$ROOT/" "$BUILD/"
ln -sfn "$ROOT/node_modules" "$BUILD/node_modules"
rm -rf "$BUILD/.output"

set +e
( cd "$BUILD" && NITRO_PRESET=node-server npm run build:beget )
BUILD_OK=$?
set -e

start_app() {
  pm2 delete rastudio >/dev/null 2>&1 || true
  pm2 start ecosystem.config.cjs --only rastudio --update-env
  pm2 save
}

if [ "$BUILD_OK" -eq 0 ] && [ -f "$BUILD/.output/server/index.mjs" ]; then
  pm2 stop rastudio >/dev/null 2>&1 || true
  rm -rf .output-prev
  if [ -d .output ]; then mv .output .output-prev; fi
  mv "$BUILD/.output" .output
  if ! start_app; then
    echo "[deploy] старт не удался — возвращаю прошлую"
    rm -rf .output
    if [ -d .output-prev ]; then mv .output-prev .output; fi
    start_app || true
    stamp
    exit 1
  fi
elif [ -f .output/server/index.mjs ]; then
  echo "[deploy] новая сборка не вышла — живой сайт не трогаю"
  start_app || true
  stamp
  exit 1
else
  echo "[deploy] нет сборки"
  stamp
  exit 1
fi

rm -rf .output-prev "$BUILD/.output"

if ! pm2 describe rastudio-deploy >/dev/null 2>&1; then
  pm2 start ecosystem.config.cjs --only rastudio-deploy
  pm2 save
fi

stamp
echo "[deploy] live $(git rev-parse --short HEAD)"
node scripts/ping-indexnow.mjs || echo "[deploy] IndexNow skip"
