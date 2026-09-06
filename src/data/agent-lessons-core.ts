/** Уроки консультанта: типы рекомендаций и граф связей. Без диска. */

export type LessonKind = "reply" | "crm" | "flow" | "id";

export const LESSON_KIND_LABEL: Record<LessonKind, string> = {
  reply: "Текст ответа",
  crm: "Действие в CRM",
  flow: "Ход разговора",
  id: "Ключ ID",
};

export const LESSON_KINDS: LessonKind[] = ["reply", "crm", "flow", "id"];

export type AgentLesson = {
  id: string;
  at: string;
  kind: LessonKind;
  intent: string;
  wrong: string;
  right: string;
  action: string;
  entity: string;
  on: boolean;
  source: string;
};

export type GraphNode = {
  id: string;
  type: "intent" | "lesson" | "action" | "entity";
  label: string;
  kind?: LessonKind;
};

export type GraphEdge = { from: string; to: string; rel: "teaches" | "does" | "binds" };

const INTENT_RE: { re: RegExp; id: string }[] = [
  { re: /отработк/, id: "отработка" },
  { re: /пропуск|не прид/, id: "пропуск" },
  { re: /пауз|приостанов/, id: "пауза" },
  { re: /абонемент|тариф/, id: "абонемент" },
  { re: /пробн/, id: "пробное" },
  { re: /расписан|слот/, id: "расписание" },
  { re: /записать реб|набор|впервые|курс/, id: "набор" },
  { re: /индивидуальн/, id: "индивидуальное" },
  { re: /телефон|карточк/, id: "вход" },
];

const ACTION_RE: { re: RegExp; id: string }[] = [
  { re: /book_lesson|поставь отработ|не ставь пробн/, id: "book_lesson" },
  { re: /note_skip|отметь пропуск/, id: "note_skip" },
  { re: /pause_classes|поставь паузу/, id: "pause_classes" },
  { re: /assign_tariff|повесь абонемент/, id: "assign_tariff" },
  { re: /submit_trial|пробное/, id: "submit_trial" },
  { re: /list_groups/, id: "list_groups" },
];

const ENTITY_RE: { re: RegExp; id: string }[] = [
  { re: /courseId|курс сайта/, id: "courseId" },
  { re: /groupId|gid/, id: "groupId" },
  { re: /teacherId|педагог/, id: "teacherId" },
  { re: /customerId/, id: "customerId" },
  { re: /tariffId/, id: "tariffId" },
  { re: /subjectId/, id: "subjectId" },
];

export function isLessonSpeech(text: string) {
  const t = String(text || "");
  if (t.length < 8) return false;
  if (/заголовок:|описание:|о курсе:|set_price|подними цен/i.test(t)) return false;
  return /неправильн|не так ответил|запомни|надо (было |говорить|спросить|отвечать|ставить|сказать)|вместо этого|учись|так не говори|ошибк[ауе]|как правильно|рекомендаци|учи консультант/i.test(
    t,
  );
}

export function guessIntent(text: string) {
  const t = String(text || "").toLowerCase();
  for (const row of INTENT_RE) if (row.re.test(t)) return row.id;
  return "общее";
}

export function guessAction(text: string) {
  const t = String(text || "").toLowerCase();
  for (const row of ACTION_RE) if (row.re.test(t)) return row.id;
  return "";
}

export function guessEntity(text: string) {
  const t = String(text || "");
  for (const row of ENTITY_RE) if (row.re.test(t)) return row.id;
  return "";
}

export function guessKind(text: string): LessonKind {
  const t = String(text || "").toLowerCase();
  if (/courseid|groupid|teacherid|не по имени|только id|ключ/i.test(t)) return "id";
  if (/сначала спроси|порядок|потом |не спрашивай|кнопк|ход разговор|сначала недел/i.test(t)) return "flow";
  if (/отработк|пропуск|пауз|абонемент|запиш|book_lesson|note_skip|pause|gid=/i.test(t)) return "crm";
  return "reply";
}

export function parseLessonSpeech(text: string): Omit<AgentLesson, "id" | "at" | "on" | "source"> | null {
  const raw = String(text || "").trim();
  if (!isLessonSpeech(raw)) return null;
  const rightHit =
    raw.match(/(?:надо(?: было)?|правильно|говори|запомни[:\s]+|вместо этого)\s*[:—-]?\s*(.+)$/i) ||
    raw.match(/как правильно[:\s]+(.+)$/i);
  const wrongHit = raw.match(/неправильн\w*[^.!?]{0,40}[«"]?([^».!?]{8,120})/);
  const right = String(rightHit?.[1] || "").replace(/^что /, "").trim().slice(0, 800);
  if (!right || right.length < 16 || /^(как правильно|что было|ошибк|урок)\b/i.test(right)) return null;
  const wrong = String(wrongHit?.[1] || "").trim().slice(0, 400);
  const blob = `${raw} ${right}`;
  return {
    kind: guessKind(blob),
    intent: guessIntent(blob),
    wrong,
    right,
    action: guessAction(blob),
    entity: guessEntity(blob),
  };
}

export function lessonGraph(lessons: AgentLesson[]): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const nodes = new Map<string, GraphNode>();
  const edges: GraphEdge[] = [];
  const put = (n: GraphNode) => {
    if (!nodes.has(n.id)) nodes.set(n.id, n);
  };
  for (const l of lessons.filter((x) => x.on !== false)) {
    const intentId = `intent:${l.intent || "общее"}`;
    put({ id: intentId, type: "intent", label: l.intent || "общее" });
    const lessonId = `lesson:${l.id}`;
    put({
      id: lessonId,
      type: "lesson",
      label: (l.right || l.wrong || l.id).slice(0, 72),
      kind: l.kind,
    });
    edges.push({ from: intentId, to: lessonId, rel: "teaches" });
    if (l.action) {
      const aid = `action:${l.action}`;
      put({ id: aid, type: "action", label: l.action });
      edges.push({ from: lessonId, to: aid, rel: "does" });
    }
    if (l.entity) {
      const eid = `entity:${l.entity}`;
      put({ id: eid, type: "entity", label: l.entity });
      edges.push({ from: lessonId, to: eid, rel: "binds" });
    }
  }
  return { nodes: [...nodes.values()], edges };
}

export function lessonsPromptText(lessons: AgentLesson[], cap = 24) {
  const live = lessons.filter((l) => l.on !== false).slice(0, cap);
  if (!live.length) return "";
  const lines = live.map((l) => {
    const head = `[${LESSON_KIND_LABEL[l.kind]}] ${l.intent}${l.action ? ` → ${l.action}` : ""}${l.entity ? ` · ${l.entity}` : ""}`;
    const body = l.wrong ? `не так: ${l.wrong.slice(0, 180)}. надо: ${l.right.slice(0, 280)}` : l.right.slice(0, 360);
    return `— ${head}: ${body}`;
  });
  return `КАРТА ОБУЧЕНИЯ (голос админки, важнее общих фраз, воронку не ломай):\n${lines.join("\n")}`;
}

export function confirmLessonReply(lesson: Pick<AgentLesson, "kind" | "intent" | "right" | "action">) {
  const bit = LESSON_KIND_LABEL[lesson.kind] || lesson.kind;
  const act = lesson.action ? ` Действие CRM: ${lesson.action}.` : "";
  return `Ольга: Запомнила. Тип — ${bit}, тема — ${lesson.intent}.${act} На карте обучения: «${String(lesson.right || "").slice(0, 90)}». Консультант на сайте уже читает.`;
}
