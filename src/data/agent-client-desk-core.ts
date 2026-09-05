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
Пропуск — note_skip. Пауза — pause_classes. Отработка — book_lesson makeup на gid группы. Не по названию.
`;
}
