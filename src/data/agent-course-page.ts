import { resolveAskToTree, type AgentTree } from "./agent-groups.ts";

export type CoursePageRow = { path: string; name: string };

/** Речь → courseId дерева. Не имя курса в каталоге. */
export const COURSE_ASK_ALIAS: { keys: string[]; path: string }[] = [
  { keys: ["физик", "tesla"], path: "/teslaphysics" },
  { keys: ["увлекательн", "science-course"], path: "/science-course" },
  { keys: ["радиотех"], path: "/radioengineering" },
  { keys: ["беспилот", "дрон"], path: "/promising-professions" },
  { keys: ["киндер", "kinder"], path: "/kinder-master" },
  { keys: ["лего", "happybricks"], path: "/happybricks" },
  { keys: ["подготовк", "к школе"], path: "/preparation-for-school" },
  { keys: ["steam", "планета"], path: "/planet-steam" },
  { keys: ["скульпт"], path: "/sculptural-studio" },
  { keys: ["вуз", "hudvuz"], path: "/podgotovka-v-hudvuz" },
  { keys: ["digital", "цифров"], path: "/digitalartschool" },
  { keys: ["манг", "аниме"], path: "/manga-and-anime" },
  { keys: ["подиум"], path: "/model-school-podium" },
  { keys: ["макияж"], path: "/model-school-makeup" },
  { keys: ["личностн"], path: "/model-school-growth" },
  { keys: ["scratch", "старт скул"], path: "/kursy-shkoly-programmirovaniya/it-лаборатория-create-для-детей-5-7-лет" },
  { keys: ["python", "пайтон"], path: "/kursy-shkoly-programmirovaniya/it-школа-программирование-на-python" },
  { keys: ["c++", "си плюс"], path: "/kursy-shkoly-programmirovaniya/it-школа-программирование-на-си" },
  { keys: ["unity", "gamedev"], path: "/kursy-shkoly-programmirovaniya/it-школа-разработка-игр-на-unity" },
  { keys: ["blender", "блендер"], path: "/gamedesign" },
  { keys: ["компас", "3d-модел"], path: "/3d-modeling" },
  { keys: ["super minds"], path: "/englishlanguagesm" },
  { keys: ["go getter", "гоу геттер"], path: "/englishlanguagegg" },
  { keys: ["коре"], path: "/vitaminkorean" },
  { keys: ["япон"], path: "/japanese" },
];

export const STUB_COURSE_TREE: AgentTree = {
  schools: [
    { id: "/robototehnika-v-kolomne", href: "/robototehnika-v-kolomne", label: "Школа робототехники" },
    { id: "/art-studio", href: "/art-studio", label: "Художественная школа" },
    { id: "/programming-school", href: "/programming-school", label: "Школа программирования" },
    { id: "/promising-professions", href: "/promising-professions", label: "Школа наук и инженерии" },
    { id: "/model-school", href: "/model-school", label: "Модельная школа" },
    { id: "/languageschool", href: "/languageschool", label: "Школа иностранных языков" },
    { id: "/preparation", href: "/preparation", label: "Подготовка к школе" },
  ],
  courses: [],
};

function rowOf(path: string, rows: CoursePageRow[], tree?: AgentTree | null): CoursePageRow | null {
  const hit = rows.find((r) => r.path === path);
  if (hit) return hit;
  const course = tree?.courses.find((c) => c.id === path || c.href === path);
  if (course) return { path: course.id, name: course.label };
  const school = tree?.schools.find((s) => s.id === path || s.href === path);
  if (school) return { path: school.id, name: school.label };
  return path.startsWith("/") ? { path, name: path } : null;
}

/** Только courseId/schoolId дерева. Имя каталога не ключ. */
export function pickCoursePage(query: string, rows: CoursePageRow[], tree?: AgentTree | null) {
  const q = (query || "").trim();
  if (!q) return null;
  const withSlash = q.startsWith("/") ? q : `/${q}`;
  const exact = rows.find((r) => r.path === q || r.path === withSlash);
  if (exact) return exact;
  const use = tree && (tree.schools.length || tree.courses.length) ? tree : STUB_COURSE_TREE;
  const hit = resolveAskToTree(q, use);
  if (hit.courseId) return rowOf(hit.courseId, rows, use);
  if (hit.schoolId) return rowOf(hit.schoolId, rows, use);
  const lower = q.toLowerCase();
  const aliasHits = COURSE_ASK_ALIAS.filter((a) => a.keys.every((k) => lower.includes(k)) || a.keys.filter((k) => lower.includes(k)).length >= 2);
  const unique = [...new Set(aliasHits.map((a) => a.path))];
  if (unique.length === 1) return rowOf(unique[0], rows, use);
  return null;
}
