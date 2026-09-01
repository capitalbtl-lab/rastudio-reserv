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

/** Только расписание. Не Олег/Ольга, не запись родителей, не клиентский чат. */
export async function scheduleVoiceTurn(prompt: string, selectedIds: string[]): Promise<ScheduleVoiceResult> {
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
Ты НЕ Олег и НЕ Ольга. Ты НЕ консультируешь родителей. Ты НЕ записываешь детей. Ты НЕ говоришь про пробные занятия для клиентов.
Ты умеешь: менять расписание на сайте, добавлять группы, отвечать по карточке группы (gid, педагог, время, филиал, места, статус, описание, календарь), сказать «загрузить из AlfaCRM» или «выгрузить в AlfaCRM».
Если запрос не про расписание / группы / предметы / филиалы / педагогов / лимиты / дни / время — kind=refuse и точная причина.
Если это вопрос «сколько / когда / кто / какой gid / какой статус» — kind=question, answer коротко по данным.
Если это правка или создание — kind=edit, action=preview. Если просят загрузить из CRM — action=pull. Выгрузить в CRM — action=push.
Филиалы только: ${BRANCHES.map((b) => `${b.city}, ${b.address}`).join(" | ")}
Отмечено групп: ${selectedIds.length}.
Ответ строго JSON: {"kind":"edit|question|refuse","reason":"","answer":"","action":"preview|pull|push|none"}`,
    `Запрос оператора: ${String(prompt || "").slice(0, 1500)}
Карточки групп на сайте:
${cards.join("\n").slice(0, 6000)}
Слоты:
${JSON.stringify(slim).slice(0, 12000)}`,
    800,
  );
  const kind = llm?.kind === "question" || llm?.kind === "refuse" ? llm.kind : "edit";
  const action = llm?.action === "pull" || llm?.action === "push" || llm?.action === "preview" ? llm.action : kind === "edit" ? "preview" : "none";
  return {
    kind,
    reason: String(llm?.reason || "").trim(),
    answer: String(llm?.answer || "").trim(),
    action: kind === "refuse" ? "none" : action,
  };
}
