#!/bin/bash
# Касса Чудновой №670: перепроверка с 2015, все площадки. Без Python.
set -e
cd /var/www/rastudio

mode="${1:-start}"

if [ "$mode" = "check" ]; then
  node -e '
    const fs = require("fs");
    const raw = JSON.parse(fs.readFileSync("storage/crm-pays.json", "utf8"));
    const rows = Array.isArray(raw) ? raw : (raw.items || []);
    const want = new Set([19764, 19765, 19766]);
    const mine = rows.filter((r) => Number(r.customerId) === 670 && !r.deleted);
    const letIds = mine.map((r) => Number(r.id) || 0).filter((id) => want.has(id)).sort((a, b) => a - b);
    const branches = [...new Set(mine.map((r) => Number(r.branchId) || 0))].sort((a, b) => a - b);
    console.log("всего строк кассы Чудновой:", mine.length);
    console.log("летние номера:", letIds.length ? letIds.join(" ") : "нет");
    console.log("площадки:", branches.join(" ") || "нет");
    try {
      const j = JSON.parse(fs.readFileSync("storage/crm-journal-job.json", "utf8"));
      console.log("очередь:", j.running ? "идёт" : "стоит", "n", j.n || 0, "/", j.total || 0);
      console.log("сейчас:", j.cur || "-");
      console.log("сообщение:", j.msg || "-");
    } catch (e) {
      console.log("очередь: нет файла");
    }
    const fill = (raw.payFill || {})["670"] || null;
    console.log("курсор кассы:", fill ? JSON.stringify(fill) : "нет");
  '
  exit 0
fi

busy=$(node -e '
  const j = JSON.parse(require("fs").readFileSync("storage/crm-journal-job.json", "utf8"));
  if (j.running && !j.stop) {
    console.log("BUSY " + (j.kind || "") + " " + (j.cur || "-"));
    process.exit(2);
  }
  console.log("IDLE");
') || {
  echo "Очередь «История из Альфа» уже занята:"
  echo "$busy"
  echo "Дождитесь конца или нажмите Стоп в Админке сайта RaStudio. Этот скрипт её не перебивает."
  exit 1
}

node -e '
  const fs = require("fs");
  const job = {
    id: "job-chudnova-pay-2015",
    running: true,
    stop: false,
    mode: "person",
    kind: "balance",
    study: "1",
    recheck: true,
    dateFrom: "2015-01-01",
    recheckDays: 4000,
    grain: "quarter",
    school: "",
    groupId: 0,
    branchId: 1,
    customerId: 670,
    take: 0,
    filter: "",
    catalogFirst: false,
    items: [{ cid: 670, branchId: 1, name: "Чуднова Александра Алексеевна" }],
    idx: 0,
    waits: 0,
    cur: "Чуднова Александра Алексеевна",
    n: 0,
    total: 1,
    msg: "Чуднова: касса заново, с 2015, все площадки.",
    fill: { kind: "balance", customerId: 670, branchId: 1 },
    startedAt: "",
    lastAt: "",
    wave: "",
    follow: [],
    archived: false
  };
  fs.writeFileSync("storage/crm-journal-job.json", JSON.stringify(job, null, 2) + "\n");
  console.log("очередь записана: касса №670 с 2015");
'

echo "Дальше: pm2 restart rastudio-history"
echo "Это только фон истории. Сайт не пересобирается."
