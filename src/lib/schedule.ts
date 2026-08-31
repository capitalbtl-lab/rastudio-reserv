import type { CmsSession } from "@/data/cms";
import { AGE_BANDS, agesOverlap, type AgeBandId } from "@/data/ages";
import { hrefForCourseFilter, prettyCourseName } from "@/data/cms";

export const WEEKDAYS: { re: RegExp; id: string; label: string }[] = [
  { re: /понедельник/i, id: "Пн", label: "Понедельник" },
  { re: /вторник/i, id: "Вт", label: "Вторник" },
  { re: /сред/i, id: "Ср", label: "Среда" },
  { re: /четверг/i, id: "Чт", label: "Четверг" },
  { re: /пятниц/i, id: "Пт", label: "Пятница" },
  { re: /суббот/i, id: "Сб", label: "Суббота" },
  { re: /воскресень/i, id: "Вс", label: "Воскресенье" },
];

export function branchMeta(session: CmsSession) {
  const blob = `${session.city} ${session.branch}`;
  if (/октябрьск/i.test(blob)) return { city: "Коломна", address: "ул. Октябрьской революции, 340", short: "Октябрьской, 340" };
  if (/гражданск/i.test(blob)) return { city: "Коломна", address: "ул. Гражданская, 2", short: "Гражданская, 2" };
  if (/пушкин|луховиц/i.test(blob)) return { city: "Луховицы", address: "ул. Пушкина, 202А", short: "Пушкина, 202А" };
  return {
    city: session.city || "Филиал",
    address: session.branch || "",
    short: session.branch || session.city || "",
  };
}

export function branchRank(session: CmsSession) {
  const blob = `${session.city} ${session.branch}`;
  if (/октябрьск/i.test(blob)) return 0;
  if (/гражданск/i.test(blob)) return 1;
  if (/луховиц|пушкин/i.test(blob)) return 2;
  return 9;
}

export function courseKey(session: CmsSession) {
  return (session.courseFilter || "").replace(/\s+/g, " ").trim() || "Курс";
}

export function courseTitle(session: CmsSession) {
  return prettyCourseName(courseKey(session));
}

export function courseHref(session: CmsSession) {
  return hrefForCourseFilter(courseKey(session), session.age);
}

function timesOf(when: string) {
  return [...when.matchAll(/(\d{1,2}:\d{2})\s*до\s*(\d{1,2}:\d{2})/gi)].map((m) => `${m[1]}–${m[2]}`);
}

export function compactWhen(when: string) {
  if (!when) return "";
  const days = WEEKDAYS.filter((d) => d.re.test(when)).map((d) => d.id);
  const times = timesOf(when);
  const twice = /2\s*раза/i.test(when);
  if (days.length && times.length) return `${twice ? "2× " : ""}${days.join("/")} ${times.join(", ")}`;
  if (days.length) return `${twice ? "2× " : ""}${days.join("/")}`;
  return when.replace(/^Занятия\s+/i, "");
}

export type DaySlot = {
  id: string;
  session: CmsSession;
  day: string;
  dayLabel: string;
  time: string;
  sort: number;
};

function dayIndex(id: string) {
  const i = WEEKDAYS.findIndex((d) => d.id === id);
  return i < 0 ? 9 : i;
}

function timeSort(time: string) {
  const m = time.match(/(\d{1,2}):(\d{2})/);
  if (!m) return 99_99;
  return Number(m[1]) * 100 + Number(m[2]);
}

export function expandSlots(session: CmsSession): DaySlot[] {
  const when = session.when || "";
  const days = WEEKDAYS.filter((d) => d.re.test(when));
  const times = timesOf(when);
  if (!days.length) {
    return [
      {
        id: `${session.id}-none`,
        session,
        day: "",
        dayLabel: "День уточняется",
        time: compactWhen(when) || "уточняется",
        sort: 9000,
      },
    ];
  }
  return days.map((day, i) => {
    const time = times[i] || times[0] || "";
    return {
      id: `${session.id}-${day.id}`,
      session,
      day: day.id,
      dayLabel: day.label,
      time,
      sort: dayIndex(day.id) * 10_000 + timeSort(time),
    };
  });
}

export function matchesAgeBand(age: string, bandId: AgeBandId) {
  const band = AGE_BANDS.find((b) => b.id === bandId);
  if (!band) return true;
  return agesOverlap(age, band.min, band.max);
}

export function nextSlots(sessions: CmsSession[], limit = 3) {
  const today = new Date().getDay(); // 0 Sunday
  function delta(dayId: string) {
    const mon = dayIndex(dayId); // 0 Monday
    if (mon > 6) return 8;
    const js = (mon + 1) % 7;
    let d = js - today;
    if (d < 0) d += 7;
    return d;
  }
  const slots = sessions.flatMap(expandSlots);
  const seen = new Set<string>();
  const unique: DaySlot[] = [];
  for (const slot of slots.sort((a, b) => delta(a.day) - delta(b.day) || a.sort - b.sort)) {
    const key = `${slot.day}-${slot.time}-${branchMeta(slot.session).short}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(slot);
    if (unique.length >= limit) break;
  }
  return unique;
}

export { AGE_BANDS };
