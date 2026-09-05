/** Действующий клиент: карточка с диска. Пропуск, пауза, абонемент — только по customerId. */

import { findDossier, upsertDossier, stampDossierLiveTariff } from "./dossiers.ts";
import { loadGroupCard } from "./group-cards.ts";
import { journalForCustomer, lessonStatusLabel } from "./crm-journal-core.ts";
import { customerBalance } from "./crm-pay.ts";
import { appendComm } from "./crm-comms.ts";
import { listAdminSlots } from "./alfacrm-schedule.ts";
import { loadTariffs } from "./crm-tariffs.ts";
import { enqueueExport } from "./crm-export-queue.ts";
import { digestPrompt, type ClientDigest } from "./agent-client-desk-core.ts";

export type { ClientDigest };
export { digestPrompt };

function todayIso() {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
}

export function clientDigest(customerId: number): ClientDigest | null {
  const id = Number(customerId) || 0;
  if (!id) return null;
  const d = findDossier({ crmId: id });
  if (!d) return null;
  const slots = listAdminSlots();
  const groups = (d.groupLinks || [])
    .filter((g) => g.active !== false && Number(g.id))
    .map((g) => {
      const slot = slots.find((s) => s.groupId === g.id && s.branchId === (g.branchId || d.branchId)) || slots.find((s) => s.groupId === g.id);
      const next = slot ? [slot.dayLabel, slot.timeFrom].filter(Boolean).join(" ") : "";
      return {
        groupId: g.id,
        branchId: g.branchId || d.branchId || 1,
        name: g.name || slot?.groupName || `группа ${g.id}`,
        courseId: g.courseId || slot?.courseId || "",
        next,
      };
    });
  const last: string[] = [];
  let nextLesson = groups.map((g) => g.next && `${g.name}: ${g.next}`).filter(Boolean).join("; ");
  for (const g of groups) {
    const cal = loadGroupCard(g.branchId, g.groupId)?.calendar || [];
    const mine = journalForCustomer(cal, id);
    const upcoming = mine.find((l) => String(l.date) >= todayIso() && Number(l.status) !== 2);
    if (upcoming && !nextLesson) {
      nextLesson = `${g.name}: ${upcoming.date} ${upcoming.from || ""}`.trim();
    }
    for (const l of mine.slice(-3).reverse()) {
      last.push(`${l.date} ${g.name} ${lessonStatusLabel(Number(l.status || 1))}`.trim());
    }
  }
  return {
    customerId: id,
    child: d.child.fio || "",
    parent: d.parent.fio || "",
    branchId: d.branchId || 1,
    groups,
    nextLesson,
    lastLessons: last.slice(0, 6),
    balance: customerBalance(id, d.extras?.balance),
    tariff: d.extras?.live_tariff === "1" ? d.tariff || "живой" : d.extras?.live_tariff === "0" ? "нет" : d.tariff || "",
    pauseUntil: String(d.extras?.pause_until || ""),
  };
}

export function applySkip(customerId: number, date: string, reason: string) {
  const id = Number(customerId) || 0;
  if (!id) return { ok: false as const, error: "Нет customerId." };
  const d = findDossier({ crmId: id });
  if (!d) return { ok: false as const, error: "Карточки на сайте нет." };
  const when = String(date || "").trim() || todayIso();
  const text = `Пропуск ${when}${reason ? `: ${reason}` : ""}`.slice(0, 400);
  upsertDossier({ crmId: id, extras: { last_skip: when, last_skip_note: text }, source: "assistant" });
  appendComm({
    customerId: id,
    branchId: d.branchId || 1,
    channel: "site",
    actor: "consultant",
    who: "Ольга",
    text,
    incoming: false,
  });
  return { ok: true as const, text };
}

export function applyPause(customerId: number, until: string, reason: string) {
  const id = Number(customerId) || 0;
  if (!id) return { ok: false as const, error: "Нет customerId." };
  const d = findDossier({ crmId: id });
  if (!d) return { ok: false as const, error: "Карточки на сайте нет." };
  const till = String(until || "").trim();
  const text = till
    ? `Пауза занятий до ${till}${reason ? `: ${reason}` : ""}`.slice(0, 400)
    : `Снимаем паузу. ${reason || ""}`.slice(0, 400);
  upsertDossier({
    crmId: id,
    extras: { pause_until: till, pause_note: text },
    source: "assistant",
  });
  appendComm({
    customerId: id,
    branchId: d.branchId || 1,
    channel: "site",
    actor: "consultant",
    who: "Ольга",
    text,
    incoming: false,
  });
  return { ok: true as const, text, pauseUntil: till };
}

export function applyClientTariff(opts: { customerId: number; tariffId: number; groupId?: number; branchId?: number }) {
  const customerId = Number(opts.customerId) || 0;
  const tariffId = Number(opts.tariffId) || 0;
  if (!customerId) return { ok: false as const, error: "Нет customerId." };
  if (!tariffId) return { ok: false as const, error: "Нужен tariffId, не имя абонемента." };
  const d = findDossier({ crmId: customerId });
  if (!d) return { ok: false as const, error: "Карточки на сайте нет." };
  const offer = loadTariffs().items.find((x) => x.id === tariffId);
  const branch = Number(opts.branchId || d.branchId) || 1;
  const groupId = Number(opts.groupId) || Number(d.groupLinks?.find((g) => g.active !== false)?.id) || 0;
  upsertDossier({
    crmId: customerId,
    branchId: branch,
    tariff: offer?.name || `абонемент ${tariffId}`,
    extras: { live_tariff: "1", tariff_id: String(tariffId) },
    source: "assistant",
  });
  stampDossierLiveTariff([customerId], true);
  enqueueExport({
    op: "customer-tariff.create",
    branchId: branch,
    entityId: customerId,
    body: {
      tariffId,
      groupId,
      calcType: 1,
      subjectIds: offer?.subjectIds,
      lessonTypeIds: offer?.lessonTypeIds,
      periodCount: offer?.periodCount,
      periodType: offer?.periodType,
      lessonsCount: offer?.lessonsCount,
    },
  });
  appendComm({
    customerId,
    branchId: branch,
    channel: "site",
    actor: "consultant",
    who: "Ольга",
    text: `Абонемент tariffId=${tariffId}${groupId ? ` группа ${groupId}` : ""} на сайте, Alfa в очереди.`,
    incoming: false,
  });
  return { ok: true as const, tariffId, groupId };
}
