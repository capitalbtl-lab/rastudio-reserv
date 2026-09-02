/**
 * Длительность занятия для цены курса.
 * Группа → строка цены только по courseId / subjectId / path. Имя не склеивает.
 */
import { listAdminSlots } from "./alfacrm-schedule";
import { ensureLivePrices, listPriceRows } from "./prices";
import { loadScheduleMap } from "./schedule-map";
import { normPath, priceRowKey, tidyCourseName, type GroupDuration, type PriceRow } from "./prices-core";
import type { CrmSlot } from "./crm-slots-core";

function minsOf(from: string, to: string) {
  const [h1, m1] = String(from || "").split(":").map(Number);
  const [h2, m2] = String(to || "").split(":").map(Number);
  if (![h1, m1, h2, m2].every((n) => Number.isFinite(n))) return 0;
  const n = h2 * 60 + m2 - (h1 * 60 + m1);
  return n > 0 && n <= 480 ? n : 0;
}

function mode(nums: number[]) {
  const c = new Map<number, number>();
  for (const n of nums) if (n > 0) c.set(n, (c.get(n) || 0) + 1);
  let best = 0;
  let bestN = 0;
  for (const [n, k] of c) {
    if (k > bestN || (k === bestN && n > best)) {
      best = n;
      bestN = k;
    }
  }
  return best;
}

function slotMins(s: CrmSlot) {
  const own = minsOf(s.timeFrom, s.timeTo);
  if (own) return own;
  return mode((s.beats || []).map((b) => minsOf(b.timeFrom, b.timeTo)));
}

function slotWeek(s: CrmSlot) {
  const n = Number(s.timesPerWeek) || (Array.isArray(s.beats) && s.beats.length ? s.beats.length : 0);
  return n > 0 ? n : 0;
}

function skipGroup(s: CrmSlot) {
  const hay = `${s.groupName} ${s.course} ${s.subject}`;
  return /ZZ-RA-PROBE|удалить|заезд|смен[аые]|экспедиц/i.test(hay);
}

/** Строка цены для группы: courseId → subjectId→courseId → path. Без имён. */
function rowForSlot(slot: CrmSlot, byKey: Map<string, PriceRow>, bySubject: Map<number, string>) {
  const own = normPath(slot.courseId || "");
  if (own && byKey.has(own)) return byKey.get(own)!;
  const mapped = slot.subjectId ? bySubject.get(slot.subjectId) || "" : "";
  if (mapped && byKey.has(mapped)) return byKey.get(mapped)!;
  const sp = normPath(slot.path || "");
  if (sp && byKey.has(sp)) return byKey.get(sp)!;
  return null;
}

export function groupDurations() {
  ensureLivePrices();
  const rows = listPriceRows();
  const byKey = new Map<string, PriceRow>();
  for (const r of rows) {
    const k = normPath(priceRowKey(r));
    if (k) byKey.set(k, r);
    if (r.path) byKey.set(normPath(r.path), r);
    if (r.id) byKey.set(normPath(r.id), r);
  }
  const bySubject = new Map<number, string>();
  for (const c of loadScheduleMap().courses) {
    const key = normPath(c.courseId || c.siteHref || "");
    if (c.subjectId && key) bySubject.set(c.subjectId, key);
  }
  const slots = listAdminSlots().filter((s) => !skipGroup(s));
  const buckets = new Map<string, CrmSlot[]>();
  let used = 0;
  for (const s of slots) {
    const row = rowForSlot(s, byKey, bySubject);
    if (!row) continue;
    const key = normPath(priceRowKey(row));
    const list = buckets.get(key) || [];
    list.push(s);
    buckets.set(key, list);
    used += 1;
  }
  const items: GroupDuration[] = [...buckets.entries()].map(([path, hits]) => ({
    path,
    course: tidyCourseName(hits[0]?.course || hits[0]?.groupName || byKey.get(path)?.name || ""),
    mins: mode(hits.map(slotMins)),
    perWeek: mode(hits.map(slotWeek)),
    groups: hits.length,
  }));
  return { items, groups: slots.length, used, courses: items.length };
}
