import { yandexJson } from "@/data/agent-channels";
import { listAdminSlots } from "@/data/alfacrm-schedule";
import { groupFactsForVoice } from "@/data/group-cards";
import { BRANCHES } from "@/data/site";

export type ScheduleVoiceResult = {
  kind: "edit" | "question" | "refuse";
  reason: string;
  answer: string;
  action: "preview" | "pull" | "push" | "none";
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

/** Только расписание. Не Олег/Ольга, не запись родителей, не клиентский чат. */
export async function scheduleVoiceTurn(prompt: string, selectedIds: string[]): Promise<ScheduleVoiceResult> {
  const local = localLimitTurn(prompt);
  if (local) return local;
  const slots = listAdminSlots();
  const slim = slots.slice(0, 90).map((s) => ({
    id: s.id,
    gid: s.groupId,
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
  }>(
    `Ты голосовой агент РАСПИСАНИЯ занятий студии «Развивайся». Только кабинет администратора.
Ты НЕ Олег и НЕ Ольга. Ты НЕ консультируешь родителей. Ты НЕ записываешь детей.
Ты умеешь: менять расписание, лимит мест / максимум детей в группе, добавлять группы, отвечать по карточке, загрузить/выгрузить AlfaCRM.
«максимальное количество детей на 15» = правка лимита, kind=edit, action=preview.
Свои фразы «привет что будем делать», «хорошо сейчас всё поправим», «скажите опубликовать» — не запросы, kind=refuse reason=это эхо.
Если запрос не про расписание — kind=refuse и точная причина.
Вопрос сколько/когда/кто — kind=question.
Отмечено групп: ${selectedIds.length}. Филиалы: ${BRANCHES.map((b) => `${b.city}, ${b.address}`).join(" | ")}
JSON: {"kind":"edit|question|refuse","reason":"","answer":"","action":"preview|pull|push|none"}`,
    `Запрос оператора: ${String(prompt || "").slice(0, 1500)}
Карточки:
${cards.join("\n").slice(0, 4000)}
Слоты:
${JSON.stringify(slim).slice(0, 10000)}`,
    800,
  );
  const kind = llm?.kind === "question" || llm?.kind === "refuse" || llm?.kind === "edit" ? llm.kind : "refuse";
  const action = llm?.action === "pull" || llm?.action === "push" || llm?.action === "preview" ? llm.action : kind === "edit" ? "preview" : "none";
  return {
    kind,
    reason: String(llm?.reason || (kind === "refuse" ? "не разобрала запрос по расписанию." : "")).trim(),
    answer: String(llm?.answer || "").trim(),
    action: kind === "refuse" ? "none" : action,
  };
}