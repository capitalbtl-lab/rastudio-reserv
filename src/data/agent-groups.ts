import { isAdminGroup, readPriority } from "./group-status.ts";

export type AgentTree = {
  schools: { id: string; href: string; label: string }[];
  courses: { id: string; href: string; label: string; schoolId: string; age?: string }[];
};

export type AgentGroupAsk = {
  age?: number;
  branchId?: number;
  course?: string;
  courseId?: string;
  schoolId?: string;
  subjectId?: number;
};

/** Речь родителя → ID школы/курса дерева. Группы по имени не ищем. */
const SCHOOL_ASK: { ask: RegExp; id: string }[] = [
  { ask: /робот/, id: "/robototehnika-v-kolomne" },
  { ask: /худож|рисов|живопис|лепк|скульпт|манг/, id: "/art-studio" },
  { ask: /програм|питон|скретч|python|scratch|айти|gamedev|unity/, id: "/programming-school" },
  { ask: /наук|физик|steam|радио|беспилот|дрон|tesla/, id: "/promising-professions" },
  { ask: /модельн|подиум|макияж|личностн/, id: "/model-school" },
  { ask: /англий|язык|япон|коре/, id: "/languageschool" },
  { ask: /подготовк|школ.*подгот/, id: "/preparation" },
];

function ageBandOfAsk(q: string): [number, number] | null {
  const range = q.match(/(\d{1,2})\s*[–—-]\s*(\d{1,2})/);
  if (range) return [Number(range[1]), Number(range[2])];
  const plus = q.match(/(\d{1,2})\s*\+/);
  if (plus) return [Number(plus[1]), 18];
  return null;
}

function courseAgeHits(c: { id: string; age?: string }, lo: number, hi: number) {
  const src = `${c.age || ""} ${c.id}`;
  const m = src.match(/(\d{1,2})\s*[–—-]\s*(\d{1,2})/);
  if (!m) return false;
  return Number(m[1]) <= hi && Number(m[2]) >= lo;
}

export function resolveAskToTree(ask: string, tree: AgentTree): { schoolId: string; courseId: string } {
  const raw = String(ask || "").trim();
  if (!raw) return { schoolId: "", courseId: "" };
  const courseEq = tree.courses.find((c) => c.id === raw || c.id === `/${raw.replace(/^\//, "")}`);
  if (courseEq) return { schoolId: courseEq.schoolId, courseId: courseEq.id };
  const schoolEq = tree.schools.find((s) => s.id === raw || s.id === `/${raw.replace(/^\//, "")}`);
  if (schoolEq) return { schoolId: schoolEq.id, courseId: "" };
  const q = raw.toLowerCase();
  const band = ageBandOfAsk(q);
  for (const a of SCHOOL_ASK) {
    if (!a.ask.test(q)) continue;
    const s = tree.schools.find((x) => x.id === a.id);
    if (!s) continue;
    if (band) {
      const course = tree.courses.find((c) => c.schoolId === s.id && courseAgeHits(c, band[0], band[1]));
      if (course) return { schoolId: s.id, courseId: course.id };
    }
    return { schoolId: s.id, courseId: "" };
  }
  return { schoolId: "", courseId: "" };
}

export function slotFitsAgent(
  slot: {
    groupId?: number;
    branchId?: number;
    statusId?: number;
    courseId?: string;
    schoolId?: string;
    path?: string;
    subjectId?: number;
  },
  ask: AgentGroupAsk,
  tree: AgentTree,
) {
  if (!Number(slot.groupId) || !isAdminGroup(slot.statusId)) return false;
  if (ask.branchId && Number(slot.branchId) !== ask.branchId) return false;
  if (ask.subjectId && Number(slot.subjectId) !== ask.subjectId) return false;
  const fromAsk = resolveAskToTree(ask.course || ask.courseId || ask.schoolId || "", tree);
  const courseId = ask.courseId || fromAsk.courseId;
  const schoolId = ask.schoolId || fromAsk.schoolId;
  if ((ask.course || ask.courseId || ask.schoolId) && !courseId && !schoolId) return false;
  if (courseId) return slot.courseId === courseId;
  if (schoolId) return slot.schoolId === schoolId;
  return true;
}

export function agentGroupLine(g: {
  gid: string;
  branchId: number;
  priority?: number;
  courseId?: string;
  schoolId?: string;
  subjectId?: number;
  name?: string;
  short?: string;
  when?: string;
  teacher?: string;
  taken?: number;
  limit?: number;
  seats?: string;
  nextDate?: string;
  timeFrom?: string;
}) {
  const p = readPriority(g.priority);
  return [
    `gid=${g.gid}`,
    `филиал=${g.branchId}`,
    `courseId=${g.courseId || "—"}`,
    `schoolId=${g.schoolId || "—"}`,
    g.subjectId ? `subjectId=${g.subjectId}` : "",
    `приоритет=${p}`,
    g.name || "",
    g.short || "",
    g.when || "",
    g.teacher || "",
    `состав ${g.taken ?? 0}/${g.limit || "—"}`,
    g.seats || "",
    g.nextDate ? `ближайшее ${g.nextDate} ${g.timeFrom || ""}` : "",
    p === 0 ? "набор с сайта закрыт" : "",
  ]
    .filter(Boolean)
    .join(" · ");
}
