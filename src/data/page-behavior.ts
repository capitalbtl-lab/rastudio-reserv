/** Клиент: что человек делает на сайте. Без cookies, sessionStorage. */

export type PageBehavior = {
  path: string;
  dwell: number;
  trail: string[];
  courses: string[];
};

const KEY = "ra_behavior";

export function readBehavior(): PageBehavior {
  const empty: PageBehavior = { path: "/", dwell: 0, trail: [], courses: [] };
  if (typeof window === "undefined") return empty;
  try {
    const raw = JSON.parse(sessionStorage.getItem(KEY) || "null") as PageBehavior | null;
    if (!raw || typeof raw !== "object") return { ...empty, path: window.location.pathname || "/" };
    return {
      path: String(raw.path || window.location.pathname || "/"),
      dwell: Number(raw.dwell) || 0,
      trail: Array.isArray(raw.trail) ? raw.trail.map(String).slice(-12) : [],
      courses: Array.isArray(raw.courses) ? raw.courses.map(String).slice(-8) : [],
    };
  } catch {
    return { ...empty, path: window.location.pathname || "/" };
  }
}

export function tickBehavior() {
  if (typeof window === "undefined") return readBehavior();
  const path = window.location.pathname || "/";
  const prev = readBehavior();
  const trail = prev.trail[prev.trail.length - 1] === path ? prev.trail : [...prev.trail, path].slice(-12);
  const course = path.length > 2 && !["/schedule", "/allcourses", "/team", "/contacts", "/admin"].includes(path);
  const courses = course && !prev.courses.includes(path) ? [...prev.courses, path].slice(-8) : prev.courses;
  const next: PageBehavior = {
    path,
    dwell: prev.path === path ? prev.dwell + 5 : 0,
    trail,
    courses,
  };
  try {
    sessionStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* */
  }
  return next;
}

export function behaviorPrompt(b?: PageBehavior | null) {
  if (!b?.path) return "";
  const trail = (b.trail || []).slice(-6).join(" → ") || b.path;
  const courses = (b.courses || []).join(", ");
  return `

Поведение на сайте (не читай вслух как отчёт):
сейчас ${b.path}, на странице уже ~${Math.max(0, Number(b.dwell) || 0)} сек.
маршрут: ${trail}
${courses ? `смотрел курсы: ${courses}` : ""}
Если задержался на курсе > 20 сек — предложи пробное в этом направлении, не спрашивая заново «что интересно».
Если скачет по школам — помоги выбрать одно. Не открывай чужие страницы сам, только кнопку open_course.`;
}
