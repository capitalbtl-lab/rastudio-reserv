#!/usr/bin/env bash
# Грязное дерево → коммит → origin/main. Beget подхватит в течение минуты.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

LOCK=/tmp/rastudio-push.lock
exec 8>"$LOCK"
if ! flock -n 8; then
  echo "[push] уже идёт"
  exit 0
fi

if [ -z "$(git status --porcelain)" ]; then
  echo "[push] чисто"
  exit 0
fi

git add -A
git reset -q -- scripts/__pycache__ 2>/dev/null || true

if git diff --cached --quiet; then
  echo "[push] нечего коммитить"
  exit 0
fi

count="$(git diff --cached --name-only | wc -l | tr -d ' ')"
git commit -m "Автовыкладка: ${count} файл."
git push origin main
echo "[push] $(git rev-parse --short HEAD) → origin/main"
HOOK="$(node --input-type=module -e "import { createHmac } from 'node:crypto'; process.stdout.write(createHmac('sha256','rastudio-admin-token').update('deploy-hook').digest('hex').slice(0,32))")"
curl -fsS -m 12 -X POST "https://www.rastudio.org/api/build" -H "x-ra-deploy: ${HOOK}" >/dev/null && echo "[push] выкладка запущена" || echo "[push] мгновенная выкладка ещё не на сервере — подхватит сторож"
