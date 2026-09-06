/** Формат карточки действующего клиента. Без диска. */

export type ClientDigest = {
  customerId: number;
  child: string;
  parent: string;
  branchId: number;
  groups: { groupId: number; branchId: number; name: string; courseId: string; next: string }[];
  nextLesson: string;
  lastLessons: string[];
  balance: number;
  tariff: string;
  pauseUntil: string;
};

export const STUDIO_RULES_SHORT =
  "Пропуск лучше предупредить заранее. Отработка — в другой группе того же курса, если есть места. Пауза — по заявлению, до конкретной даты. Цены — на странице курса, колонка «Все» за 4 недели. Жалобы и возврат денег — 8 (800) 511-34-01.";

export const STUDIO_HOURS_SHORT =
  "ЦМИТ на Октябрьской революции, 340 — ср–вс 10:00–19:00. Гражданская, 2 — по расписанию занятий. Луховицы, Пушкина 202А — по согласованию.";

export const STUDIO_ADDR_SHORT =
  "Коломна: ЦМИТ, Октябрьской революции 340, 2 этаж; Гражданская 2, ТЦ «Олимпийский». Луховицы: Пушкина 202А, ТЦ «Хороший», 3 этаж. Телефон 8 (800) 511-34-01.";

export function pauseUntilIso(raw: string, now = new Date()) {
  const t = String(raw || "").trim();
  if (!t) return "";
  const d = new Date(now.getTime());
  if (/две недели/i.test(t)) d.setDate(d.getDate() + 14);
  else if (/неделю|неделя/i.test(t)) d.setDate(d.getDate() + 7);
  else if (/месяц/i.test(t)) d.setMonth(d.getMonth() + 1);
  else {
    const m = t.match(/(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?/);
    if (!m) return t;
    const year = m[3] ? (String(m[3]).length === 2 ? 2000 + Number(m[3]) : Number(m[3])) : d.getFullYear();
    return `${year}-${String(Number(m[2])).padStart(2, "0")}-${String(Number(m[1])).padStart(2, "0")}`;
  }
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function digestPrompt(d: ClientDigest | null) {
  if (!d) return "";
  const groups = d.groups.length
    ? d.groups.map((g) => `gid=${g.groupId} филиал=${g.branchId} courseId=${g.courseId || "—"} ${g.name}${g.next ? ` · ${g.next}` : ""}`).join("\n")
    : "групп нет";
  return `

КАРТОЧКА С ДИСКА (не выдумывать занятие и остаток):
ребёнок ${d.child || "—"} · customerId ${d.customerId} · филиал ${d.branchId}
группы:
${groups}
ближайшее: ${d.nextLesson || "нет в слотах"}
явка: ${d.lastLessons.join("; ") || "журнала нет"}
абонемент: ${d.tariff || "нет пометки"} · остаток ${d.balance}
пауза до: ${d.pauseUntil || "нет"}
Пропуск — note_skip. Пауза — pause_classes. Отработка — list_groups по courseId, не только свой gid; book_lesson makeup. Имя ребёнка повторно не спрашивать. Второго ребёнка не путать с этим customerId.
`;
}
