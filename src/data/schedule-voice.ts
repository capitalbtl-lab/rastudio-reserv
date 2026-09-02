import { yandexJson } from "@/data/agent-channels";
import { listAdminSlots } from "@/data/alfacrm-schedule";
import { groupFactsForVoice } from "./group-cards";
import { searchClientViews } from "./dossiers";
import { BRANCHES } from "@/data/site";
import { IDS_FOR_AGENT } from "@/data/ids";
import { scheduleGuidePrompt } from "@/data/agent-section-guides-run";

export type ScheduleVoiceResult = {
  kind: "edit" | "question" | "refuse" | "openClient" | "openGroup" | "openTab";
  reason: string;
  answer: string;
  action: "preview" | "pull" | "push" | "none";
  pane?: "groups" | "clients";
  query?: string;
  customerId?: number;
  branchId?: number;
  groupId?: number;
  slotId?: string;
  status?: "учится" | "лид" | "архив";
  ageBand?: string;
};

function norm(s: string) {
  return String(s || "")
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^а-я0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function localLimitTurn(prompt: string): ScheduleVoiceResult | null {
  const t = norm(prompt);
  if (!/мест|лимит|свободн|набор|вместимост|максимальн|количеств|детей|человек|ребен/.test(t)) return null;
  if (!/\d/.test(t)) return null;
  return { kind: "edit", reason: "", answer: "", action: "preview" };
}

function stripQuery(raw: string) {
  return String(raw || "")
    .replace(/^(найди|найти|открой|покажи|поищи|карточка|карточку|клиент[аеу]?|ученик[аеу]?|реб[её]нк\w*|группу|группа)\s+/i, "")
    .replace(/\b(пожалуйста|карточка|карточку|клиента?|ученика?)\b/gi, "")
    .trim();
}

function localPeopleTurn(prompt: string): ScheduleVoiceResult | null {
  const t = norm(prompt);
  if (/покажи лид|вкладк.{0,16}лид|открой лид|фильтр лид/.test(t)) {
    return { kind: "openTab", reason: "", answer: "Открываю лиды с диска. Из AlfaCRM не выгружаю.", action: "none", pane: "clients", status: "лид" };
  }
  if (/покажи архив|вкладк.{0,16}архив|фильтр архив/.test(t)) {
    return { kind: "openTab", reason: "", answer: "Открываю архив с диска. Из AlfaCRM не выгружаю.", action: "none", pane: "clients", status: "архив" };
  }
  if (/покажи текущ|текущих клиент|фильтр текущ/.test(t)) {
    return { kind: "openTab", reason: "", answer: "Открываю текущих клиентов.", action: "none", pane: "clients", status: "учится" };
  }
  if (/вкладк.{0,16}клиент|покажи клиент|перечень клиент|список клиент|открой клиент(ов|ами)?$/.test(t)) {
    return { kind: "openTab", reason: "", answer: "Открываю клиентов.", action: "none", pane: "clients", status: "учится" };
  }
  if (/вкладк.{0,16}групп|покажи групп|перечень групп|список групп/.test(t) && !/клиент/.test(t)) {
    return { kind: "openTab", reason: "", answer: "Открываю группы.", action: "none", pane: "groups" };
  }
  const gid = t.match(/групп[ауие]?\s+(\d{2,6})/) || t.match(/\bgid\s*(\d{2,6})/) || t.match(/номер[а]?\s+(\d{2,6})/);
  if (gid && /групп|gid|открой|покажи|найди/.test(t)) {
    const groupId = Number(gid[1]);
    const slot = listAdminSlots().find((s) => Number(s.groupId) === groupId);
    return {
      kind: "openGroup",
      reason: "",
      answer: slot ? `Открываю группу ${groupId}, ${slot.groupName}.` : `Открываю группу ${groupId}.`,
      action: "none",
      pane: "groups",
      groupId,
      slotId: slot?.id,
      branchId: slot?.branchId,
    };
  }
  if (/групп/.test(t) && /открой|найди|покажи|карточка групп/.test(t)) {
    const q = stripQuery(prompt);
    if (q.length >= 3) {
      const nq = norm(q);
      const hits = listAdminSlots().filter((s) => norm(`${s.groupName} ${s.course} ${s.groupId}`).includes(nq));
      if (hits.length === 1) {
        const s = hits[0];
        return {
          kind: "openGroup",
          reason: "",
          answer: `Открываю ${s.groupName}.`,
          action: "none",
          pane: "groups",
          groupId: s.groupId,
          slotId: s.id,
          branchId: s.branchId,
        };
      }
      if (hits.length > 1) {
        return {
          kind: "openTab",
          reason: "",
          answer: `Нашла ${hits.length} групп. Открываю список, уточните номер.`,
          action: "none",
          pane: "groups",
        };
      }
    }
  }
  if (!/клиент|ученик|карточка|карточк|найди|найти|поищи|фамилия|кто так|реб[её]н/.test(t)) return null;
  if (/лимит|мест|расписан|добав групп/.test(t) && !/клиент|ученик|карточка/.test(t)) return null;
  const q = stripQuery(prompt);
  if (!q || q.length < 2) {
    return { kind: "question", reason: "", answer: "Назовите фамилию или имя ребёнка — открою карточку.", action: "none", pane: "clients" };
  }
  const hits = searchClientViews(q, 8).items.filter((x) => x.crmId);
  if (!hits.length) {
    return {
      kind: "openTab",
      reason: "",
      answer: `Не нашла «${q}» среди клиентов. Открываю вкладку, поищите там.`,
      action: "none",
      pane: "clients",
      query: q,
    };
  }
  if (hits.length === 1) {
    const h = hits[0];
    return {
      kind: "openClient",
      reason: "",
      answer: `Открываю карточку ${h.displayName || h.child || h.crmId}.`,
      action: "none",
      pane: "clients",
      query: q,
      customerId: Number(h.crmId),
      branchId: Number(h.branchId) || 1,
    };
  }
  return {
    kind: "openTab",
    reason: "",
    answer: `Нашла ${hits.length}: ${hits
      .slice(0, 4)
      .map((h) => h.displayName || h.child)
      .join(", ")}. Кого открыть?`,
    action: "none",
    pane: "clients",
    query: q,
  };
}

/** Только кабинет. Не Олег/Ольга, не запись родителей. */
export async function scheduleVoiceTurn(prompt: string, selectedIds: string[]): Promise<ScheduleVoiceResult> {
  const people = localPeopleTurn(prompt);
  if (people) return people;
  const local = localLimitTurn(prompt);
  if (local) return local;
  const slots = listAdminSlots();
  const slim = slots.slice(0, 90).map((s) => ({
    id: s.id,
    groupId: s.groupId,
    branchId: s.branchId,
    subjectId: s.subjectId,
    courseId: s.courseId || "",
    teacherId: s.teacherId,
    name: s.groupName,
    school: s.school,
    course: s.course,
    age: s.age,
    day: s.dayLabel,
    from: s.timeFrom,
    to: s.timeTo,
    teacher: s.teacher,
    branch: `${s.city}, ${s.branch}`,
    limit: s.limit,
    taken: s.taken,
    subject: s.subject,
    statusId: s.statusId,
  }));
  const cards = groupFactsForVoice(60);
  const llm = await yandexJson<{
    kind?: string;
    reason?: string;
    answer?: string;
    action?: string;
    pane?: string;
    query?: string;
    customerId?: number;
    branchId?: number;
    groupId?: number;
    slotId?: string;
    status?: string;
    ageBand?: string;
  }>(
    `Ты голосовой агент кабинета студии «Развивайся»: расписание, группы и клиенты.
Ты НЕ Олег и НЕ Ольга. Ты НЕ консультируешь родителей. Ты НЕ записываешь детей.
Умеешь: менять расписание и лимит мест, добавлять группы, открывать карточку группы, искать карточку клиента, открывать вкладки «группы» и «клиенты», фильтровать текущих/лидов/архив, загрузить/выгрузить AlfaCRM.
Карточка клиента на десктопе — правая панель, не popup. Overlay только на телефоне.
${scheduleGuidePrompt() || IDS_FOR_AGENT}
Открывать группу только по groupId+branchId (groupCardId = card:group:{branchId}:{groupId}). Клиента — только по customerId (clientCardId = card:customer:{customerId}). Курс — courseId, предмет — subjectId.
«найди Иванова» / «открой карточку Маши» = kind=openClient, если один человек (подставь customerId); если несколько — kind=openTab pane=clients и query.
«открой группу 405» = kind=openGroup, groupId=405.
«покажи клиентов» / «текущих» = kind=openTab pane=clients status=учится.
«покажи лиды» = kind=openTab pane=clients status=лид. Не выгружать AlfaCRM.
«покажи архив» = kind=openTab pane=clients status=архив. Не выгружать AlfaCRM.
«максимальное количество детей на 15» = правка лимита, kind=edit, action=preview.
Свои фразы «привет что будем делать», «хорошо сейчас всё поправим», «скажите опубликовать» — не запросы, kind=refuse reason=это эхо.
Если запрос не про расписание/группы/клиентов — kind=refuse и точная причина.
Вопрос сколько/когда/кто в группе — kind=question.
Отмечено групп: ${selectedIds.length}. Филиалы: ${BRANCHES.map((b) => `${b.city}, ${b.address}`).join(" | ")}
JSON: {"kind":"edit|question|refuse|openClient|openGroup|openTab","reason":"","answer":"","action":"preview|pull|push|none","pane":"groups|clients","query":"","customerId":0,"branchId":0,"groupId":0,"slotId":"","status":"учится|лид|архив","ageBand":""}`,
    `Запрос оператора: ${String(prompt || "").slice(0, 1500)}
Карточки групп:
${cards.join("\n").slice(0, 3500)}
Слоты:
${JSON.stringify(slim).slice(0, 9000)}`,
    800,
  );
  if (!llm) {
    if (localLimitTurn(prompt)) return { kind: "edit", reason: "", answer: "", action: "preview" };
    if (/добав|создай|постав|измени|поменя|лимит|мест|расписан|групп|цифр/i.test(prompt)) {
      return { kind: "edit", reason: "", answer: "", action: "preview" };
    }
    return {
      kind: "question",
      reason: "",
      answer: "Не получилось связаться с агентом. Нажмите стрелку — сделаю предпросмотр по тексту.",
      action: "none",
    };
  }
  const kind =
    llm?.kind === "question" || llm?.kind === "refuse" || llm?.kind === "edit" || llm?.kind === "openClient" || llm?.kind === "openGroup" || llm?.kind === "openTab"
      ? llm.kind
      : "refuse";
  const action = llm?.action === "pull" || llm?.action === "push" || llm?.action === "preview" ? llm.action : kind === "edit" ? "preview" : "none";
  return {
    kind,
    reason: String(llm?.reason || (kind === "refuse" ? "не разобрала запрос по расписанию, группам или клиентам." : "")).trim(),
    answer: String(llm?.answer || "").trim(),
    action: kind === "refuse" || kind === "openClient" || kind === "openGroup" || kind === "openTab" ? "none" : action,
    pane: llm?.pane === "clients" || llm?.pane === "groups" ? llm.pane : kind === "openClient" ? "clients" : kind === "openGroup" ? "groups" : undefined,
    query: String(llm?.query || "").trim() || undefined,
    customerId: Number(llm?.customerId) || undefined,
    branchId: Number(llm?.branchId) || undefined,
    groupId: Number(llm?.groupId) || undefined,
    slotId: String(llm?.slotId || "").trim() || undefined,
    status: llm?.status === "лид" || llm?.status === "архив" || llm?.status === "учится" ? llm.status : undefined,
    ageBand: String(llm?.ageBand || "").trim() || undefined,
  };
}
