/** Действующий клиент: карточка с диска. Пропуск, пауза, абонемент — только по customerId. */

import { findDossier, upsertDossier, stampDossierLiveTariff } from "./dossiers.ts";
import { loadGroupCard } from "./group-cards.ts";
import { journalForCustomer, lessonStatusLabel } from "./crm-journal-core.ts";
import { customerBalance, snapshotBalance } from "./crm-pay.ts";
import { appendComm } from "./crm-comms.ts";
import { listAdminSlots, scheduleChipOf, slotChips } from "./alfacrm-schedule.ts";
import { loadTariffs, matchTariffs } from "./crm-tariffs.ts";
import { parseDossierCtt } from "./pupil-tariffs.ts";
import { enqueueExport } from "./crm-export-queue.ts";
import { digestPrompt, pauseUntilIso, STUDIO_RULES_SHORT, type ClientDigest } from "./agent-client-desk-core.ts";
import { WEEKDAY_CHIPS, type SessionFacts } from "./agent-facts.ts";
import { allowedLessonType, emptyBookFlags, type BookSettings } from "./agent-book-kinds.ts";
import { CLIENT_TOPICS } from "./agent-chips.ts";
import { lessonDatesInRange } from "@/lib/trial-slot";
import {
  MAKEUP_WEEK_CHIPS,
  makeupDateLabel,
  pageMakeup,
  rankMakeupSlots,
  weekLabel,
  weekWindow,
  type MakeupWeek,
} from "./agent-makeup.ts";

export type { ClientDigest };
export { digestPrompt };

export type DeskRights = BookSettings & {
  consultantCanSkip: boolean;
  consultantCanPause: boolean;
  consultantCanTariff: boolean;
};

const OPEN_RIGHTS: DeskRights = {
  consultantCanBook: true,
  ...emptyBookFlags(true),
  consultantCanSkip: true,
  consultantCanPause: true,
  consultantCanTariff: false,
};

function phoneHint() {
  return "Позвоните 8 (800) 511-34-01 — администратор отметит.";
}

const TOPIC_CHIPS = CLIENT_TOPICS.map((c) => ({
  label: c.label,
  send: c.send || c.label,
  primary: c.primary,
}));

type DeskChip = { label: string; send: string; primary?: boolean; note?: string };

export async function makeupList(customerId: number, weekday: string) {
  const d = clientDigest(customerId);
  const empty = { digest: d, list: [] as { gid: string; when: string; chip: string; branchId: number; nextDate: string; timeFrom: string; courseId: string; subjectId?: number; teacherId?: number; teacher?: string; priority: number; seats: string; name?: string; short?: string }[], courseLabel: "" };
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

export async function makeupWeekSlots(customerId: number, week: MakeupWeek, weekday?: string) {
  const d = clientDigest(customerId);
  const empty = {
    digest: d,
    list: [] as (Awaited<ReturnType<typeof import("./alfacrm-schedule.ts").groupsForQuery>>[number] & {
      at: number;
      ownGid: boolean;
      ownTeacher: boolean;
    })[],
    courseLabel: "",
  };
  if (!d) return empty;
  const { groupsForQuery } = await import("./alfacrm-schedule.ts");
  const ids = [...new Set(d.groups.map((g) => g.courseId).filter(Boolean))];
  const slots = listAdminSlots();
  const ownGids = new Set(d.groups.map((g) => g.groupId));
  const ownTeacherIds = new Set<number>();
  const ownTeacherNames = new Set<string>();
  for (const g of d.groups) {
    const slot = slots.find((s) => s.groupId === g.groupId && s.branchId === g.branchId) || slots.find((s) => s.groupId === g.groupId);
    if (slot?.teacherId) ownTeacherIds.add(Number(slot.teacherId));
    const name = String(slot?.teacher || "").trim().toLowerCase();
    if (name) ownTeacherNames.add(name);
  }
  const win = weekWindow(week);
  const seen = new Set<string>();
  const list = empty.list;
  for (const courseId of ids.slice(0, 4)) {
    const part = await groupsForQuery({ courseId, weekday: weekday || undefined });
    for (const g of part) {
      const dates = lessonDatesInRange({ day: g.day || 0, timeFrom: g.timeFrom }, win.from, win.to);
      const ownGid = ownGids.has(Number(g.gid));
      const ownTeacher = Boolean(
        (g.teacherId && ownTeacherIds.has(Number(g.teacherId))) ||
          (g.teacher && ownTeacherNames.has(g.teacher.trim().toLowerCase())),
      );
      for (const at of dates) {
        const nextDate = `${String(at.getDate()).padStart(2, "0")}.${String(at.getMonth() + 1).padStart(2, "0")}.${at.getFullYear()}`;
        const key = `${g.gid}-${nextDate}-${g.timeFrom}`;
        if (seen.has(key)) continue;
        seen.add(key);
        list.push({ ...g, nextDate, at: at.getTime(), ownGid, ownTeacher });
      }
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
  const child = facts.child?.split(/\s+/)[0] || d?.child.split(/\s+/)[0] || "ребёнок";
  const intent = facts.intent || "";
  if (!intent || intent === "готово") {
    if (/жалоб|возврат|претенз|деньги верн/i.test(lastUser)) {
      return {
        reply: `${n}: Жалобы и возврат денег — 8 (800) 511-34-01. Карточку ${child} не закрываю.`,
        chips: TOPIC_CHIPS,
      };
    }
    if (intent === "готово") {
      return {
        reply: `${n}: Хорошо. Если понадобится отработка, пропуск или пауза — напишите.`,
        chips: TOPIC_CHIPS,
      };
    }
    const words = lastUser.trim().split(/\s+/).filter(Boolean).length;
    if (words >= 5 && !/gid=|это ${child}|да, это/i.test(lastUser)) return null;
    return {
      reply: `${n}: ${child} в карточке${d?.nextLesson ? `, ближайшее: ${d.nextLesson}` : ""}. Чем помочь?`,
      chips: TOPIC_CHIPS,
    };
  }
  if (intent === "расписание") {
    return {
      reply: `${n}: ${child} — ближайшее занятие: ${d?.nextLesson || "в слотах на сайте нет даты"}. Нужна отработка, пропуск или абонемент?`,
      chips: [] as { label: string; send: string; primary?: boolean }[],
    };
  }
  if (intent === "абонемент") {
    if (!rights.consultantCanTariff) {
      return {
        reply: `${n}: ${child}: абонемент ${d?.tariff || "нет пометки"}, остаток ${d ? d.balance : "—"}. Назначить абонемент может администратор по телефону 8 (800) 511-34-01.`,
        chips: [],
      };
    }
    const offers = tariffsForClient(facts.customerId);
    if (!offers.length) {
      return {
        reply: `${n}: ${child}: абонемент ${d?.tariff || "нет пометки"}, остаток ${d ? d.balance : "—"}. Шаблонов для групп на диске не вижу. Назовите tariffId или кабинет.`,
        chips: [],
      };
    }
    return {
      reply: `${n}: ${child}: абонемент ${d?.tariff || "нет пометки"}, остаток ${d ? d.balance : "—"}. Нажмите шаблон — повешу на карточку. Можно сказать номер.`,
      chips: offers.map((t, i) => ({
        label: t.price ? `${t.name} · ${t.price} ₽` : t.name,
        send: `Повесьте абонемент tariff_id=${t.id}`,
        primary: i === 0,
      })),
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
    if (!facts.age) {
      return {
        reply: `${n}: ${child} уже в карточке. Второго запишу как нового на ваш телефон. Сколько лет второму?`,
        chips: [
          { label: "3–4 года", send: "Второму ребёнку 4 года" },
          { label: "5–6 лет", send: "Второму ребёнку 6 лет" },
          { label: "7–9 лет", send: "Второму ребёнку 8 лет", primary: true },
          { label: "10–14 лет", send: "Второму ребёнку 12 лет" },
        ],
      };
    }
    if (!facts.secondChild) {
      return {
        reply: `${n}: Второму ${facts.age} лет. Как зовут? Запишу пробное на ваш телефон, не в карточку ${child}.`,
        chips: [],
      };
    }
    if (!facts.school) {
      return {
        reply: `${n}: ${facts.secondChild}, ${facts.age} лет. Какое направление — роботы, художка или программирование?`,
        chips: [
          { label: "Робототехника", send: "Интересна школа робототехники", primary: true },
          { label: "Художественная", send: "Интересна художественная школа" },
          { label: "Программирование", send: "Интересна школа программирования" },
        ],
      };
    }
    return {
      reply: `${n}: ${facts.secondChild}, ${facts.age} лет, ${facts.school}. Пробное на ваш телефон — в группе или в свободный день?`,
      chips: [
        { label: "Пробное в группе", send: "Хочу пробное на ближайшем занятии группы", primary: true },
        { label: "Пробное в свободный день", send: "Хочу пробное в свободный день, дату согласуем" },
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
      chips: open.slice(0, 8).map((g, i) => {
        const { label, note } = scheduleChipOf(g);
        return {
          label,
          note: [intent, note].filter(Boolean).join(" · "),
          send: `Поставьте ${kind} gid=${g.gid} филиал=${g.branchId} дата=${g.nextDate || ""} время=${g.timeFrom || ""} курс=${g.courseId || ""} subject_id=${g.subjectId || ""} teacher_id=${g.teacherId || ""}`,
          primary: i === 0,
        };
      }),
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
    if (!facts.makeupWeek) {
      return {
        reply: `${n}: На какой неделе удобно отработать занятие ${child} — на этой, на следующей или позже?`,
        chips: MAKEUP_WEEK_CHIPS,
      };
    }
    const pack = await makeupWeekSlots(facts.customerId, facts.makeupWeek, facts.day);
    const ranked = rankMakeupSlots(pack.list, Boolean(facts.makeupOtherTeacher));
    const usingOther = Boolean(facts.makeupOtherTeacher) || !ranked.own.length;
    const page = pageMakeup(ranked.pool, facts.makeupSkip || 0, 3);
    if (!page.slice.length) {
      if (!usingOther && ranked.other.length) {
        return {
          reply: `${n}: У вашего педагога ${weekLabel(facts.makeupWeek)} нет свободных слотов отработки. Могу предложить другого педагога того же курса.`,
          chips: [{ label: "Другой педагог", send: "Предложите другого педагога", primary: true }, ...MAKEUP_WEEK_CHIPS],
        };
      }
      return {
        reply: `${n}: ${weekLabel(facts.makeupWeek).replace(/^на /, "На ")} в курсе «${pack.courseLabel || "этого направления"}» нет живых групп с местами. Выберите другую неделю или позвоните 8 (800) 511-34-01. Пробное вместо отработки не ставлю.`,
        chips: MAKEUP_WEEK_CHIPS,
      };
    }
    const teacherBit =
      !ranked.own.length && !facts.makeupOtherTeacher ? "педагогов этого курса" : usingOther ? "другого педагога" : "вашего педагога";
    const extra: DeskChip[] = [];
    if (page.more) extra.push({ label: "Ещё три варианта", send: "Покажите ещё три варианта отработки" });
    if (!usingOther && ranked.other.length) extra.push({ label: "Другой педагог", send: "Предложите другого педагога" });
    const tidy = (name: string) => String(name || "").replace(/^\d{4}\s+/, "").replace(/\s+/g, " ").trim();
    return {
      reply: `${n}: ${weekLabel(facts.makeupWeek).replace(/^на /, "На ")} у ${teacherBit} три ближайших слота отработки по курсу «${tidy(pack.courseLabel) || "этого направления"}». Нажмите вариант — поставлю. Если не подходит, покажу ещё три. Пробное вместо отработки не ставлю.`,
      chips: [
        ...page.slice.map((g, i) => {
          const when = `${makeupDateLabel(new Date(g.at))} ${g.timeFrom || ""}`.trim();
          return {
            label: `${when} · ${g.short || g.branch}`,
            note: [g.teacher, g.seats, tidy(g.name)].filter(Boolean).join(" · "),
            send: `Поставьте отработку gid=${g.gid} филиал=${g.branchId} дата=${g.nextDate || ""} время=${g.timeFrom || ""} курс=${g.courseId || ""} subject_id=${g.subjectId || ""} teacher_id=${g.teacherId || ""}`,
            primary: i === 0,
          };
        }),
        ...extra,
      ],
    };
  }
  return null;
}

export function tariffsForClient(customerId: number) {
  const id = Number(customerId) || 0;
  if (!id) return [] as { id: number; name: string; price: number }[];
  const d = findDossier({ crmId: id });
  if (!d) return [];
  const slots = listAdminSlots();
  const seen = new Set<number>();
  const out: { id: number; name: string; price: number }[] = [];
  const push = (t: { id: number; name: string; price: number; archive?: boolean }) => {
    if (!t.id || t.archive || seen.has(t.id)) return;
    seen.add(t.id);
    out.push({ id: t.id, name: t.name || `абонемент ${t.id}`, price: Number(t.price) || 0 });
  };
  for (const g of d.groupLinks || []) {
    if (g.active === false || !g.id) continue;
    const slot = slots.find((s) => s.groupId === g.id && s.branchId === (g.branchId || d.branchId)) || slots.find((s) => s.groupId === g.id);
    if (!slot) continue;
    for (const t of matchTariffs(slot)) push(t);
  }
  if (!out.length) {
    const branch = Number(d.branchId) || 1;
    for (const t of loadTariffs().items) {
      if (t.branchIds?.length && !t.branchIds.includes(branch)) continue;
      push(t);
    }
  }
  return out.slice(0, 8);
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

  const tariffHit = lastUser.match(/tariff_id=(\d+)/i);
  if (tariffHit || (facts.intent === "абонемент" && /повесь|назначь|повесьте абонемент/i.test(lastUser))) {
    if (rights.consultantCanTariff === false) {
      return { reply: `${n}: Абонемент вешает администратор. ${phoneHint()}`, chips: [], done: true };
    }
    const tariffId = Number(tariffHit?.[1] || lastUser.match(/\b(\d{3,7})\b/)?.[1] || 0);
    if (!tariffId) {
      const lock = await lockedClientTurn(who, facts, rights, lastUser);
      if (lock) return { reply: lock.reply, chips: lock.chips, done: true };
      return { reply: `${n}: Назовите tariffId шаблона.`, chips: [], done: true };
    }
    const res = applyClientTariff({
      customerId: facts.customerId,
      tariffId,
      groupId: Number(d?.groups[0]?.groupId) || 0,
      branchId: Number(d?.branchId) || 0,
    });
    return {
      reply: res.ok
        ? `${n}: Абонемент tariffId=${res.tariffId} на карточке ${child}. Alfa догонит очередью.`
        : `${n}: ${res.error}`,
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
    balance: customerBalance(
      id,
      snapshotBalance(
        d.extras?.balance,
        parseDossierCtt(d.extras).filter((t) => !t.archived).reduce((n, t) => n + (Number(t.rest) || 0), 0),
      ),
    ),
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
