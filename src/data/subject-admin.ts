import type { CrmSubject } from "./crm-subjects";
import { loadSubjects } from "./crm-subjects";
import { loadScheduleMap, saveScheduleMap } from "./schedule-map";
import { loadSiteTree } from "./site-tree";
import { courseIdOfSubject } from "./ids";
import { subjectTariffStats } from "./crm-tariffs";
import { listAdminSlots } from "./alfacrm-schedule";
import { countSubjectUsage } from "./subject-usage";

export function packSubjectRows(list?: CrmSubject[]) {
  const subjects = list || loadSubjects();
  const tree = loadSiteTree();
  const map = loadScheduleMap();
  const bySub = new Map(map.courses.map((c) => [c.subjectId, c]));
  const { bySubject, branches } = subjectTariffStats();
  const usage = countSubjectUsage(listAdminSlots());
  return {
    ok: true as const,
    subjects: subjects.map((s) => {
      const st = bySubject.get(s.id) || { total: 0, byBranch: {} as Record<number, number>, names: [] as string[] };
      const link = bySub.get(s.id);
      const courseId = link?.courseId || courseIdOfSubject(s.id, tree);
      const course = courseId ? tree.courses.find((c) => c.id === courseId || c.href === courseId) : undefined;
      const school = course ? tree.schools.find((x) => x.id === course.schoolId) : undefined;
      const gs = usage.get(s.id);
      return {
        ...s,
        tariffTotal: st.total,
        tariffByBranch: st.byBranch,
        tariffNames: st.names,
        courseId: course?.id || courseId || "",
        courseLabel: course?.label || "",
        schoolLabel: school?.label || "",
        groupByBranch: gs?.groups || {},
        groupTotal: gs?.groupTotal || 0,
        studentByBranch: gs?.students || {},
        studentTotal: gs?.studentTotal || 0,
      };
    }),
    tariffBranches: branches,
    tree: {
      schools: tree.schools.map((s) => ({ id: s.id, label: s.label })),
      courses: tree.courses.map((c) => ({ id: c.id, label: c.label, schoolId: c.schoolId, href: c.href })),
    },
  };
}

export function bindSubjectCourse(subjectId: number, courseId: string) {
  const tree = loadSiteTree();
  const course = tree.courses.find((c) => c.id === courseId || c.href === courseId);
  const school = course ? tree.schools.find((s) => s.id === course.schoolId) : undefined;
  const map = loadScheduleMap();
  const sub = loadSubjects().find((s) => s.id === subjectId);
  const next = map.courses.filter((c) => c.subjectId !== subjectId);
  if (subjectId && courseId) {
    next.push({
      subjectId,
      subjectName: sub?.name || "",
      courseId: course?.id || courseId,
      schoolId: school?.id || course?.schoolId || "",
      siteHref: course?.href || course?.id || "",
      school: school?.label || "",
    });
  }
  saveScheduleMap({ ...map, courses: next });
  return packSubjectRows();
}

export function subjectMapForAgent() {
  const packed = packSubjectRows();
  const rows = packed.subjects.filter((s) => s.id && (s.courseId || s.groupTotal));
  if (!rows.length) return "Предметы: карта курса сайта пуста. Вкладка Предметы → Загрузить из AlfaCRM и привязать курс.";
  const br = (s: (typeof rows)[0], id: number) => {
    const g = Number(s.groupByBranch[id] || 0);
    const u = Number(s.studentByBranch[id] || 0);
    return g || u ? `${g}/${u}` : "—";
  };
  return [
    "Предметы сейчас (subjectId → курс сайта · гр/уч ЦМИТ / Гражданская / Луховицы / Лето / всего). Курс сайта в CRM не уходит:",
    ...rows.map((s) => {
      const course = s.courseId ? `${s.courseId}${s.courseLabel ? ` «${s.courseLabel}»` : ""}` : "нет курса сайта";
      return `${s.id} «${s.name}» → ${course} · ${br(s, 2)} · ${br(s, 1)} · ${br(s, 3)} · ${br(s, 4)} · ${s.groupTotal}гр/${s.studentTotal}уч`;
    }),
  ].join("\n");
}
