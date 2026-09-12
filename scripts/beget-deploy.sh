#!/usr/bin/env bash
# Выкладка rastudio.org на Beget.
# Живой процесс не гасим до готовой новой сборки — иначе 8 минут 502.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

LOCK=/tmp/rastudio-deploy.lock
if [ -f "$LOCK" ]; then
  age=$(( $(date +%s) - $(stat -c %Y "$LOCK" 2>/dev/null || echo 0) ))
  if [ "$age" -gt 1500 ]; then
    echo "[deploy] снимаю зависший lock (${age}s)"
    rm -f "$LOCK"
  fi
fi

git fetch origin main
BEFORE="$(git rev-parse HEAD)"
AFTER="$(git rev-parse origin/main)"
STAMP_FILE="$ROOT/.output/.deploy-rev"
LIVE="$(cat "$STAMP_FILE" 2>/dev/null || cat "$ROOT/.deploy-rev" 2>/dev/null || true)"
if [ "${1:-}" != "--force" ] && [ "$BEFORE" = "$AFTER" ] && [ "$LIVE" = "$AFTER" ]; then
  echo "[deploy] уже актуально $(git rev-parse --short HEAD)"
  exit 0
fi

echo "[deploy] ${BEFORE:0:7} → ${AFTER:0:7} stamp=$(date -u +%Y-%m-%d-%H-%M)"
git reset --hard origin/main
if [ "${RA_DEPLOY_REEXEC:-}" != "1" ]; then
  export RA_DEPLOY_REEXEC=1
  exec bash "$ROOT/scripts/beget-deploy.sh" --force
fi

if [ ! -d node_modules ] || ! git diff --quiet "$BEFORE" HEAD -- package-lock.json 2>/dev/null; then
  npm ci
fi

port_up() { ss -ltnp 2>/dev/null | grep -q ':3000'; }

bring_up() {
  if port_up; then
    echo "[deploy] 3000 уже слушает — не трогаю"
    return
  fi
  if [ ! -f "$ROOT/.output/server/index.mjs" ] && [ -f "$ROOT/.output.bak/server/index.mjs" ]; then
    echo "[deploy] возвращаю предыдущую сборку"
    rm -rf "$ROOT/.output"
    mv "$ROOT/.output.bak" "$ROOT/.output"
  fi
  if [ ! -f "$ROOT/.output/server/index.mjs" ]; then
    echo "[deploy] нет index.mjs"
    return
  fi
  pm2 start "$ROOT/ecosystem.config.cjs" --only rastudio >/dev/null 2>&1 || pm2 restart rastudio --update-env >/dev/null 2>&1 || true
  sleep 2
  if ! port_up; then
    echo "[deploy] pm2 не слушает 3000 — стартую node"
    nohup env NODE_ENV=production HOST=0.0.0.0 PORT=3000 node --max-old-space-size=640 "$ROOT/.output/server/index.mjs" >/tmp/rastudio-node.log 2>&1 &
    sleep 1
  fi
}

# Если прошлый прогон остановил сайт — поднять сразу, не ждать сборки.
bring_up

# Вотчер ждёт этот процесс. Сборку отвязываем (setsid), сами ждём метку — иначе git уже новый, а сайт старый.
if [ "${RA_DEPLOY_BG:-}" != "1" ]; then
  echo "[deploy] сборка в фоне, текущий сайт не гасим"
  setsid env RA_DEPLOY_REEXEC=1 RA_DEPLOY_BG=1 bash "$ROOT/scripts/beget-deploy.sh" --force </dev/null >>/tmp/rastudio-deploy.bg.log 2>&1 &
  want="$(git rev-parse HEAD)"
  for _ in $(seq 1 70); do
    live="$(cat "$ROOT/.output/.deploy-rev" 2>/dev/null || true)"
    if [ "$live" = "$want" ]; then
      echo "[deploy] сайт $(git rev-parse --short HEAD)"
      exit 0
    fi
    sleep 12
  done
  echo "[deploy] сборка ещё идёт, сайт пока прежний — вотчер не дублирует"
  exit 0
fi

exec 9>"$LOCK"
if ! flock -w 20 9; then
  echo "[deploy] сборка уже идёт"
  exit 0
fi

STAGE="$ROOT/.build-stage"
fail_cleanup() {
  echo "[deploy] сборка упала — текущий сайт не трогал, снимаю lock"
  rm -rf "$STAGE" || true
  restore_media || true
  rm -f "$LOCK" || true
  bring_up || true
}
trap fail_cleanup ERR
rm -rf "$STAGE"
mkdir -p "$STAGE"
git archive HEAD | tar -x -C "$STAGE"
if [ -f "$ROOT/.env" ]; then cp "$ROOT/.env" "$STAGE/.env"; fi
ln -sfn "$ROOT/node_modules" "$STAGE/node_modules"

HOLD="$ROOT/.media-imported-hold"
restore_media() {
  if [ -d "$HOLD" ]; then
    mkdir -p "$ROOT/public/media"
    rm -rf "$ROOT/public/media/imported"
    mv "$HOLD" "$ROOT/public/media/imported"
  fi
}
trap restore_media EXIT
if [ -d public/media/imported ]; then
  rm -rf "$HOLD"
  mv public/media/imported "$HOLD"
fi

(cd "$STAGE" && npm run build:beget)
css="$(ls "$STAGE/.output/public/assets/"*.css 2>/dev/null | head -1 || true)"
if [ ! -f "$STAGE/.output/server/index.mjs" ] || [ -z "$css" ]; then
  echo "[deploy] сборка без index.mjs или CSS — оставляю текущий сайт"
  rm -rf "$STAGE"
  restore_media
  bring_up
  rm -f "$LOCK"
  exit 1
fi

restore_media
trap - EXIT
trap - ERR

pm2 stop rastudio >/dev/null 2>&1 || true
fuser -k 3000/tcp >/dev/null 2>&1 || true
if [ -d "$ROOT/.output" ]; then
  rm -rf "$ROOT/.output.bak"
  mv "$ROOT/.output" "$ROOT/.output.bak"
fi
mv "$STAGE/.output" "$ROOT/.output"
rm -rf "$STAGE"

git rev-parse HEAD > "$ROOT/.output/.deploy-rev"
git rev-parse HEAD > "$ROOT/.deploy-rev"

mkdir -p "$ROOT/.output/public/media"
if [ -d "$ROOT/public/media/imported" ] && [ ! -e "$ROOT/.output/public/media/imported" ]; then
  ln -sfn "$ROOT/public/media/imported" "$ROOT/.output/public/media/imported"
fi

pm2 delete rastudio >/dev/null 2>&1 || true
pm2 start "$ROOT/ecosystem.config.cjs" --only rastudio >/dev/null 2>&1 || true
sleep 2
if ! port_up; then
  echo "[deploy] pm2 не слушает 3000 — стартую node"
  nohup env NODE_ENV=production HOST=0.0.0.0 PORT=3000 node --max-old-space-size=640 "$ROOT/.output/server/index.mjs" >/tmp/rastudio-node.log 2>&1 &
  sleep 1
fi
rm -rf "$ROOT/.output.bak"

# Вотчер не рестартуем, если уже online — иначе он убивает сам себя и крутит сборку.
if ! pm2 describe rastudio-deploy 2>/dev/null | grep -q "status.*online"; then
  pm2 start "$ROOT/ecosystem.config.cjs" --only rastudio-deploy >/dev/null 2>&1 || true
fi
pm2 restart rastudio-history --update-env >/dev/null 2>&1 || pm2 start "$ROOT/ecosystem.config.cjs" --only rastudio-history >/dev/null 2>&1 || true
for app in rastudio-night-groups rastudio-pay-poll; do
  if ! pm2 describe "$app" >/dev/null 2>&1; then
    pm2 start "$ROOT/ecosystem.config.cjs" --only "$app"
  fi
done
pm2 save

git rev-parse HEAD > "$ROOT/.output/.deploy-rev"
git rev-parse HEAD > "$ROOT/.deploy-rev"
rm -f "$LOCK"
echo "[deploy] live $(git rev-parse --short HEAD)"
node scripts/ping-indexnow.mjs || echo "[deploy] IndexNow skip"
