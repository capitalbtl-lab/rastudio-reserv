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

bring_up() {
  if [ ! -f "$ROOT/.output/server/index.mjs" ] && [ -f "$ROOT/.output.bak/server/index.mjs" ]; then
    echo "[deploy] возвращаю предыдущую сборку"
    rm -rf "$ROOT/.output"
    mv "$ROOT/.output.bak" "$ROOT/.output"
  fi
  if [ -f "$ROOT/.output/server/index.mjs" ]; then
    pm2 start "$ROOT/ecosystem.config.cjs" --only rastudio >/dev/null 2>&1 || pm2 restart rastudio --update-env >/dev/null 2>&1 || true
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
  exit 1
fi

restore_media
trap - EXIT

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
pm2 start "$ROOT/ecosystem.config.cjs" --only rastudio
rm -rf "$ROOT/.output.bak"

pm2 restart rastudio-deploy --update-env >/dev/null 2>&1 || pm2 start "$ROOT/ecosystem.config.cjs" --only rastudio-deploy >/dev/null 2>&1 || true
for app in rastudio-night-groups rastudio-pay-poll; do
  if ! pm2 describe "$app" >/dev/null 2>&1; then
    pm2 start "$ROOT/ecosystem.config.cjs" --only "$app"
  fi
done
pm2 save

git rev-parse HEAD > "$ROOT/.output/.deploy-rev"
git rev-parse HEAD > "$ROOT/.deploy-rev"
echo "[deploy] live $(git rev-parse --short HEAD)"
node scripts/ping-indexnow.mjs || echo "[deploy] IndexNow skip"
