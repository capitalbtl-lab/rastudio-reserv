import type { CmsSession } from "@/data/cms";

export function tidyGroupName(name: string) {
  return String(name || "")
    .replace(/^\d{4}\s+/, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function nextLessonDate(session: Pick<CmsSession, "day" | "timeFrom">) {
  const crmDay = Number(session.day) || 0;
  if (!crmDay) return null;
  const js = crmDay === 7 ? 0 : crmDay;
  const [hh, mm] = String(session.timeFrom || "10:00").split(":").map((n) => Number(n) || 0);
  const now = new Date();
  const d = new Date(now);
  d.setHours(hh, mm, 0, 0);
  let add = (js - d.getDay() + 7) % 7;
  if (add === 0 && d.getTime() <= now.getTime()) add = 7;
  d.setDate(d.getDate() + add);
  return d;
}

export function formatTrialDate(d: Date) {
  return d.toLocaleDateString("ru-RU", { weekday: "short", day: "numeric", month: "short" });
}

export function isoDate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function freePlaces(session: Pick<CmsSession, "limit" | "taken">) {
  const limit = Number(session.limit) || 0;
  const taken = Number(session.taken) || 0;
  if (!limit) return { n: -1, label: "набор открыт" };
  const n = Math.max(0, limit - taken);
  const word = n === 1 ? "место" : n >= 2 && n <= 4 ? "места" : "мест";
  return { n, label: n ? `${n} ${word}` : "мест нет" };
}

export function whenShort(session: CmsSession) {
  const day = String(session.when || "").split(/\s+/)[0] || "";
  if (session.timeFrom && session.timeTo) return `${day} ${session.timeFrom}–${session.timeTo}`;
  return session.when || "";
}
