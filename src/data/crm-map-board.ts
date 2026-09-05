/** Доска соответствий: только schoolId / courseId. Имена — подписи. */

export type MapLink = { id: number; title: string; courseId: string; schoolId: string };
export type MapBoardCourse = { courseId: string; label: string; age: string; items: MapLink[] };
export type MapBoardSchool = { schoolId: string; label: string; courses: MapBoardCourse[] };

function ageLo(s: string) {
  const m = String(s || "").match(/(\d{1,2})/);
  return m ? Number(m[1]) : 99;
}

export function groupMapByTree(
  tree: {
    schools: { id: string; label: string }[];
    courses: { id: string; schoolId: string; label: string; age: string }[];
  },
  links: MapLink[],
): MapBoardSchool[] {
  const placed = new Set<number>();
  const rows: MapBoardSchool[] = tree.schools.map((school) => {
    const list = tree.courses
      .filter((c) => c.schoolId === school.id)
      .slice()
      .sort((a, b) => ageLo(a.age || a.label) - ageLo(b.age || b.label) || a.label.localeCompare(b.label, "ru"));
    const courses: MapBoardCourse[] = list.map((c) => {
      const items = links.filter((l, i) => {
        if (l.courseId !== c.id) return false;
        placed.add(i);
        return true;
      });
      return { courseId: c.id, label: c.label, age: c.age || "", items };
    });
    const loose = links.filter((l, i) => {
      if (placed.has(i) || l.courseId || l.schoolId !== school.id) return false;
      placed.add(i);
      return true;
    });
    if (loose.length) courses.push({ courseId: `${school.id}#loose`, label: "Без курса", age: "", items: loose });
    return { schoolId: school.id, label: school.label, courses };
  });
  const orphan = links.filter((_, i) => !placed.has(i));
  if (orphan.length) {
    rows.push({
      schoolId: "other",
      label: "Прочее",
      courses: [{ courseId: "other#loose", label: "Без курса", age: "", items: orphan }],
    });
  }
  return rows;
}
