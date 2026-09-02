import type { CrmSlot, SlotDraft } from "@/data/crm-slots-core";

function eveningTime(raw: string) {
  const m = String(raw || "").replace(".", ":").replace(",", ":").match(/(\d{1,2}):(\d{2})/);
  if (!m) return String(raw || "").slice(0, 5);
  let h = Number(m[1]);
  if (h >= 1 && h <= 9) h += 12;
  return `${String(h).padStart(2, "0")}:${m[2]}`;
}

function schoolOf(path: string, subject: string, group: string) {
  const t = `${path} ${subject} ${group}`.toLowerCase();
  if (/худож|рисов|лепк|аним|манг/.test(t)) return "Художественная школа";
  if (/робот/.test(t)) return "Школа робототехники";
  if (/python|scratch|питон|скретч|програм|gamedev|blender/.test(t)) return "Школа программирования";
  if (/наук|физик|steam|радио|инженер/.test(t)) return "Школа наук и инженерии";
  if (/англий|язык|япон|коре/.test(t)) return "Школа иностранных языков";
  return "";
}

export function parseDraftFromSpeech(text: string, catalog: CrmSlot[], prev?: Partial<SlotDraft>): SlotDraft {
  const t = String(text || "").toLowerCase().replace(/ё/g, "е");
  const next: SlotDraft = {
    school: prev?.school || "",
    course: prev?.course || "",
    courseId: prev?.courseId || "",
    schoolId: prev?.schoolId || "",
    subjectId: prev?.subjectId,
    age: prev?.age || "",
    day: Number(prev?.day) || 0,
    timeFrom: prev?.timeFrom || "",
    timeTo: prev?.timeTo || "",
    branch: prev?.branch || "",
    teacher: prev?.teacher || "",
  };
  const days: [RegExp, number][] = [
    [/понедельник|\bпн\b/, 1],
    [/вторник|\bвт\b/, 2],
    [/сред[аыу]|\bср\b/, 3],
    [/четверг|\bчт\b/, 4],
    [/пятниц|\bпт\b/, 5],
    [/суббот|\bсб\b/, 6],
    [/воскресень|\bвс\b/, 7],
  ];
  for (const [re, d] of days) if (re.test(t)) next.day = d;
  const span = t.match(/с\s*(\d{1,2})(?:[:.](\d{2}))?\s*до\s*(\d{1,2})(?:[:.](\d{2}))?/);
  if (span) {
    next.timeFrom = eveningTime(`${span[1]}:${span[2] || "00"}`);
    next.timeTo = eveningTime(`${span[3]}:${span[4] || "00"}`);
  }
  if (/гражданск/.test(t)) next.branch = "Коломна, ул. Гражданская, 2";
  else if (/цмит|октябрьск|революц/.test(t)) next.branch = "Коломна, ЦМИТ, ул. Октябрьской революции, 340";
  else if (/луховиц|пушкин/.test(t)) next.branch = "Луховицы, ул. Пушкина, 202А";
  const names = [...new Set(catalog.map((s) => s.teacher).filter(Boolean))];
  const teach = names.find((n) => t.includes(n.toLowerCase().split(" ")[0].replace(/ё/g, "е")));
  if (teach) next.teacher = teach;
  const age = t.match(/(\d{1,2})\s*[-–]\s*(\d{1,2})/);
  if (age) next.age = `${age[1]}-${age[2]} лет`;
  const hit = catalog.find((s) => s.course && t.includes(s.course.toLowerCase().slice(0, 18)));
  if (hit) {
    next.course = hit.course;
    next.courseId = hit.courseId || next.courseId;
    next.school = hit.school;
    next.schoolId = hit.schoolId || next.schoolId;
    next.subjectId = hit.subjectId || next.subjectId;
    next.age = hit.age || next.age;
  }
  if (!next.school && next.course) next.school = schoolOf("", next.course, "");
  return next;
}
