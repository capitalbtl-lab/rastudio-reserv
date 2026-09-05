import { resolveAskToTree, COURSE_ASK, type AgentTree } from "./agent-groups.ts";

export type CoursePageRow = { path: string; name: string };

/** @deprecated речь → courseId живёт в COURSE_ASK / resolveAskToTree */
export const COURSE_ASK_ALIAS = COURSE_ASK.map((a) => ({ keys: a.keys, path: a.courseId }));

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
  return null;
}
