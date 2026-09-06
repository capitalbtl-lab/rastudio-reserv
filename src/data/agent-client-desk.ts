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
import { WEEKDAY_CHIPS, type SessionFacts } from "./agent-facts.ts";

export type { ClientDigest };
export { digestPrompt };

export async function makeupList(customerId: number, weekday: string) {
  const d = clientDigest(customerId);
  if (!d) return { digest: null as ClientDigest | null, list: [] as Awaited<ReturnType<typeof import("./alfacrm-schedule").groupsForQuery>>, courseLabel: "" };
  const { groupsForQuery } = await import("./alfacrm-schedule.ts");
  const ids = [...new Set(d.groups.map((g) => g.courseId).filter(Boolean))];
  const seen = new Set<string>();
  const list: Awaited<ReturnType<typeof groupsForQuery>> = [];
  const queries = ids.length ? ids.slice(0, 4).map((courseId) => ({ courseId, weekday })) : [];
  for (const q of queries) {
    const part = await groupsForQuery(q);
    for (const g of part) {
      const key = `${g.gid}-${g.when}`;
      if (seen.has(key)) continue;
      seen.add(key);
      list.push(g);
    }
  }
  const courseLabel = d.groups.map((g) => g.name).filter(Boolean)[0] || ids[0] || "";
  return { digest: d, list, courseLabel };
}

export async function lockedClientTurn(who: "oleg" | "olga", facts: SessionFacts) {
  if (facts.mode !== "client" || !facts.identified || !facts.customerId) return null;
  const n = who === "olga" ? "Ольга" : "Олег";
  const found = who === "olga" ? "нашла" : "нашёл";
  const d = clientDigest(facts.customerId);
  const child = facts.child || d?.child.split(/\s+/)[0] || "ребёнок";
  const intent = facts.intent || "";
  if (intent === "расписание") {
    return {
      reply: `${n}: ${child} — ближайшее занятие: ${d?.nextLesson || "в слотах на сайте нет даты"}. Нужна отработка, пропуск или абонемент?`,
      chips: [] as { label: string; send: string; primary?: boolean }[],
    };
  }
  if (intent === "абонемент") {
    return {
      reply: `${n}: ${child}: абонемент ${d?.tariff || "нет пометки"}, остаток ${d ? d.balance : "—"}.`,
      chips: [],
    };
  }
  if (intent === "правила") {
    return {
      reply: `${n}: Пропуск лучше предупредить заранее. Отработка — в другой группе того же курса, если есть места. Пауза — по заявлению, до конкретной даты. Что из этого нужно?`,
      chips: [],
    };
  }
  if (intent === "пауза") {
    if (facts.pauseUntil) return null;
    return {
      reply: `${n}: На какой срок поставить паузу ${child}? Напишите дату «до …» или выберите срок.`,
      chips: [
        { label: "Неделя", send: "Пауза на неделю" },
        { label: "Две недели", send: "Пауза на две недели", primary: true },
        { label: "Месяц", send: "Пауза на месяц" },
      ],
    };
  }
  if (intent === "пропуск") {
    return {
      reply: `${n}: Отметить, что ${child} не придёт на ближайшее${d?.nextLesson ? ` (${d.nextLesson})` : ""}?`,
      chips: [
        { label: "Да, отметить", send: "Да, отметьте пропуск ближайшего занятия", primary: true },
        { label: "Другая дата", send: "Пропуск в другую дату" },
      ],
    };
  }
  if (intent === "отработка") {
    if (!facts.day) {
      return {
        reply: `${n}: На какой день поставить отработку ${child}? Если в своей группе нет этого дня — посмотрю другие группы того же курса.`,
        chips: WEEKDAY_CHIPS,
      };
    }
    const pack = await makeupList(facts.customerId, facts.day);
    const open = pack.list.filter((g) => g.priority !== 0 && g.seats !== "мест нет");
    if (!open.length) {
      return {
        reply: `${n}: На ${facts.day} в курсе «${pack.courseLabel || "этого направления"}» сейчас нет живых групп с местами. Выберите другой день или позвоните 8 (800) 511-34-01. Пробное вместо отработки не ставлю.`,
        chips: WEEKDAY_CHIPS,
      };
    }
    return {
      reply: `${n}: На ${facts.day} ${found} ${open.length} групп того же курса. Нажмите слот — поставлю отработку.`,
      chips: open.slice(0, 8).map((g, i) => ({
        label: `Отработка · ${g.chip}`,
        send: `Поставьте отработку gid=${g.gid} филиал=${g.branchId} дата=${g.nextDate || ""} время=${g.timeFrom || ""} курс=${g.courseId || ""} subject_id=${g.subjectId || ""}`,
        primary: i === 0,
      })),
    };
  }
  return null;
}

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
