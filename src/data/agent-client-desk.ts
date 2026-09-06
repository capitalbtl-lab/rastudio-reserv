/** Действующий клиент: карточка с диска. Пропуск, пауза, абонемент — только по customerId. */

import { findDossier, upsertDossier, stampDossierLiveTariff } from "./dossiers.ts";
import { loadGroupCard } from "./group-cards.ts";
import { journalForCustomer, lessonStatusLabel } from "./crm-journal-core.ts";
import { customerBalance } from "./crm-pay.ts";
import { appendComm } from "./crm-comms.ts";
import { listAdminSlots } from "./alfacrm-schedule.ts";
import { loadTariffs } from "./crm-tariffs.ts";
import { enqueueExport } from "./crm-export-queue.ts";
import { digestPrompt, pauseUntilIso, STUDIO_RULES_SHORT, type ClientDigest } from "./agent-client-desk-core.ts";
import { WEEKDAY_CHIPS, type SessionFacts } from "./agent-facts.ts";
import { allowedLessonType, type BookSettings } from "./agent-book-kinds.ts";

export type { ClientDigest };
export { digestPrompt };

export type DeskRights = BookSettings & {
  consultantCanSkip: boolean;
  consultantCanPause: boolean;
  consultantCanTariff: boolean;
};

const OPEN_RIGHTS: DeskRights = {
  consultantCanBook: true,
  consultantCanBookTrial: true,
  consultantCanBookGroup: true,
  consultantCanBookMakeup: true,
  consultantCanBookOvertime: true,
  consultantCanBookExtra: true,
  consultantCanBookIndividual: true,
  consultantCanBookOther: true,
  consultantCanSkip: true,
  consultantCanPause: true,
  consultantCanTariff: false,
};

function phoneHint() {
  return "Позвоните 8 (800) 511-34-01 — администратор отметит.";
}

export async function makeupList(customerId: number, weekday: string) {
  const d = clientDigest(customerId);
  const empty = { digest: d, list: [] as { gid: string; when: string; chip: string; branchId: number; nextDate: string; timeFrom: string; courseId: string; subjectId?: number; teacherId?: number; priority: number; seats: string }[], courseLabel: "" };
  if (!d) return empty;
  const { groupsForQuery } = await import("./alfacrm-schedule.ts");
  const ids = [...new Set(d.groups.map((g) => g.courseId).filter(Boolean))];
  const seen = new Set<string>();
  const list = empty.list;
  for (const courseId of ids.slice(0, 4)) {
    const part = await groupsForQuery({ courseId, weekday });
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

export async function lockedClientTurn(who: "oleg" | "olga", facts: SessionFacts, rights: DeskRights = OPEN_RIGHTS, lastUser = "") {
  if (facts.wantsBook || facts.wantsSkip) return null;
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
      reply: rights.consultantCanTariff
        ? `${n}: ${child}: абонемент ${d?.tariff || "нет пометки"}, остаток ${d ? d.balance : "—"}. Назвать tariffId, чтобы повесить, или хватит остатка?`
        : `${n}: ${child}: абонемент ${d?.tariff || "нет пометки"}, остаток ${d ? d.balance : "—"}. Назначить абонемент может администратор по телефону 8 (800) 511-34-01.`,
      chips: [],
    };
  }
  if (intent === "правила") {
    return {
      reply: `${n}: ${STUDIO_RULES_SHORT} Что из этого нужно для ${child}?`,
      chips: [
        { label: "Отработка", send: "Нужна отработка пропуска" },
        { label: "Пропуск", send: "Не сможем прийти на ближайшее занятие" },
        { label: "Пауза", send: "Поставим занятия на паузу" },
      ],
    };
  }
  if (intent === "второй") {
    return {
      reply: `${n}: ${child} уже в карточке. Второго запишу как нового на ваш телефон. Сколько лет второму и как зовут?`,
      chips: [
        { label: "3–4 года", send: "Второму ребёнку 4 года" },
        { label: "5–6 лет", send: "Второму ребёнку 6 лет" },
        { label: "7–9 лет", send: "Второму ребёнку 8 лет", primary: true },
        { label: "10–14 лет", send: "Второму ребёнку 12 лет" },
      ],
    };
  }
  if (intent === "индивидуальное" || intent === "сверхурочное" || intent === "дополнительное") {
    const kind = intent === "индивидуальное" ? "individual" : intent === "сверхурочное" ? "overtime" : "extra";
    if (!allowedLessonType(rights, kind)) {
      return { reply: `${n}: ${intent} ставит администратор. ${phoneHint()}`, chips: [] };
    }
    if (!facts.day) {
      return {
        reply: `${n}: На какой день поставить ${intent} для ${child}? Нужны педагог, дата и время.`,
        chips: WEEKDAY_CHIPS,
      };
    }
    const pack = await makeupList(facts.customerId, facts.day);
    const open = pack.list.filter((g) => g.priority !== 0);
    if (!open.length) {
      return {
        reply: `${n}: На ${facts.day} слотов у педагогов этого курса не вижу. Другой день или 8 (800) 511-34-01.`,
        chips: WEEKDAY_CHIPS,
      };
    }
    return {
      reply: `${n}: На ${facts.day} ${found} слоты. Нажмите — поставлю ${intent}.`,
      chips: open.slice(0, 8).map((g, i) => ({
        label: `${intent} · ${g.chip}${g.teacher ? ` · ${g.teacher}` : ""}`,
        send: `Поставьте ${kind} gid=${g.gid} филиал=${g.branchId} дата=${g.nextDate || ""} время=${g.timeFrom || ""} курс=${g.courseId || ""} subject_id=${g.subjectId || ""} teacher_id=${g.teacherId || ""}`,
        primary: i === 0,
      })),
    };
  }
  if (intent === "пауза") {
    if (rights.consultantCanPause === false) {
      return { reply: `${n}: Паузу ставит администратор. ${phoneHint()}`, chips: [] };
    }
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
    if (rights.consultantCanSkip === false) {
      return { reply: `${n}: Пропуск отмечает администратор. ${phoneHint()}`, chips: [] };
    }
    if (/другую дату|другая дата/i.test(lastUser) && !facts.day) {
      return {
        reply: `${n}: На какой день отметить пропуск ${child}?`,
        chips: WEEKDAY_CHIPS,
      };
    }
    if (facts.day) {
      return {
        reply: `${n}: Отметить пропуск ${child} в ${facts.day}?`,
        chips: [
          { label: "Да, отметить", send: `Да, отметьте пропуск ${facts.day}`, primary: true },
          { label: "Другой день", send: "Пропуск в другую дату" },
        ],
      };
    }
    return {
      reply: `${n}: Отметить, что ${child} не придёт на ближайшее${d?.nextLesson ? ` (${d.nextLesson})` : ""}?`,
      chips: [
        { label: "Да, отметить", send: "Да, отметьте пропуск ближайшего занятия", primary: true },
        { label: "Другая дата", send: "Пропуск в другую дату" },
      ],
    };
  }
  if (intent === "отработка") {
    if (!allowedLessonType(rights, "makeup")) {
      return { reply: `${n}: Отработку ставит администратор. ${phoneHint()}`, chips: [] };
    }
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
        send: `Поставьте отработку gid=${g.gid} филиал=${g.branchId} дата=${g.nextDate || ""} время=${g.timeFrom || ""} курс=${g.courseId || ""} subject_id=${g.subjectId || ""} teacher_id=${g.teacherId || ""}`,
        primary: i === 0,
      })),
    };
  }
  return null;
}

function parseChipIds(text: string) {
  const g = String(text || "");
  const num = (re: RegExp) => {
    const m = g.match(re);
    return m ? Number(m[1]) : 0;
  };
  const str = (re: RegExp) => g.match(re)?.[1] || "";
  return {
    gid: str(/gid=(\d+)/i),
    branchId: num(/филиал=(\d+)/i),
    date: str(/дата=([^\s]+)/i),
    time: str(/время=([^\s]+)/i),
    courseId: str(/курс=([^\s]+)/i),
    subjectId: num(/subject_id=(\d+)/i),
    teacherId: num(/teacher_id=(\d+)/i),
    kind: /makeup|отработк/i.test(g) ? "makeup" : /individual|индивидуальн/i.test(g) ? "individual" : /overtime|сверхурочн/i.test(g) ? "overtime" : /extra|дополнительн/i.test(g) ? "extra" : /trial|пробн/i.test(g) ? "trial" : "group",
  };
}

export async function completeClientAction(
  who: "oleg" | "olga",
  facts: SessionFacts,
  rights: DeskRights,
  lastUser: string,
): Promise<{ reply: string; chips: { label: string; send: string; primary?: boolean }[]; done: boolean } | null> {
  if (facts.mode !== "client" || !facts.identified || !facts.customerId) return null;
  const n = who === "olga" ? "Ольга" : "Олег";
  const did = who === "olga" ? "Отметила" : "Отметил";
  const put = who === "olga" ? "Поставила" : "Поставил";
  const d = clientDigest(facts.customerId);
  const child = facts.child || d?.child.split(/\s+/)[0] || "ребёнок";

  if (facts.wantsSkip) {
    if (rights.consultantCanSkip === false) {
      return { reply: `${n}: Пропуск отмечает администратор. ${phoneHint()}`, chips: [], done: true };
    }
    const res = applySkip(facts.customerId, facts.day || "", lastUser);
    return {
      reply: res.ok
        ? `${n}: ${did} пропуск ${child}${d?.nextLesson ? ` (${d.nextLesson})` : ""}. Нужна отработка в другой группе того же курса?`
        : `${n}: ${res.error}`,
      chips: res.ok
        ? [
            { label: "Отработка", send: "Нужна отработка пропуска", primary: true },
            { label: "Этого достаточно", send: "Спасибо, этого достаточно" },
          ]
        : [],
      done: true,
    };
  }

  if (facts.intent === "пауза" && facts.pauseUntil) {
    if (rights.consultantCanPause === false) {
      return { reply: `${n}: Паузу ставит администратор. ${phoneHint()}`, chips: [], done: true };
    }
    const until = pauseUntilIso(facts.pauseUntil);
    const res = applyPause(facts.customerId, until, lastUser);
    return {
      reply: res.ok ? `${n}: ${put} паузу ${child} до ${until}. Когда вернуться — напишите, сниму.` : `${n}: ${res.error}`,
      chips: [],
      done: true,
    };
  }

  if (facts.wantsBook && /gid=\d/i.test(lastUser)) {
    const ids = parseChipIds(lastUser);
    if (!allowedLessonType(rights, ids.kind)) {
      return { reply: `${n}: Такой тип занятия ставит администратор. ${phoneHint()}`, chips: [], done: true };
    }
    const card = findDossier({ crmId: facts.customerId });
    const { saveTrialLead } = await import("./trial-save.ts");
    const saved = await saveTrialLead({
      parent: d?.parent || card?.parent?.fio || "Родитель",
      child: d?.child || card?.child?.fio || child,
      dob: String(card?.child?.dob || ""),
      phone: card?.phones?.[0] || card?.phoneDigits || "",
      email: "",
      course: ids.courseId,
      branch: String(ids.branchId || d?.branchId || card?.branchId || ""),
      gid: ids.gid,
      date: ids.date,
      time: ids.time,
      subjectId: ids.subjectId || undefined,
      teacherId: ids.teacherId || undefined,
      kind: ids.kind,
    });
    const label = ids.kind === "makeup" ? "отработку" : ids.kind === "trial" ? "пробное" : "занятие";
    return {
      reply: saved.ok
        ? `${n}: ${put} ${label}${ids.date ? ` на ${ids.date}` : ""}${ids.time ? ` в ${ids.time}` : ""}. Alfa догонит очередью.`
        : `${n}: ${saved.error || "Не получилось поставить."}`,
      chips: [],
      done: true,
    };
  }

  const lock = await lockedClientTurn(who, facts, rights, lastUser);
  if (lock) return { reply: lock.reply, chips: lock.chips, done: true };
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
