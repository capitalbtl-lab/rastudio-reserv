import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { logAdmin } from "./admin-settings";
import { PAY_TEST_PHONE } from "./crm-pay-test-core";
import {
  TRIAL_TEST_ID,
  TRIAL_TEST_DATE,
  TRIAL_TEST_TIME,
  TRIAL_TEST_SUBJECT,
  isChudnovaAlexandra,
  PAY_TEST_NAME,
  planChudnovaTrial,
} from "./crm-trial-test-core";
import { formatRuPhone } from "./ru-phone";

const g = globalThis as { __raTrialTest?: boolean };

function markFile() {
  return join(process.cwd(), "storage", "crm-trial-test.json");
}

function loadMark() {
  try {
    if (!existsSync(markFile())) return { done: "" };
    return JSON.parse(readFileSync(markFile(), "utf8")) as { done?: string; at?: string; note?: string };
  } catch {
    return { done: "" };
  }
}

function saveMark(row: { done: string; at: string; note: string }) {
  mkdirSync(dirname(markFile()), { recursive: true });
  writeFileSync(markFile(), JSON.stringify(row, null, 0), "utf8");
}

function addMins(hhmm: string, mins: number) {
  const [h, m] = String(hhmm || "").split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return "";
  const t = ((h * 60 + m + Number(mins || 0)) % (24 * 60) + 24 * 60) % (24 * 60);
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}

async function findChudnova(
  request: typeof import("./alfacrm").request,
  t: string,
): Promise<{ id: number; branchId: number; name: string } | null> {
  const phone = formatRuPhone(PAY_TEST_PHONE).replace(/\D/g, "") || "79163389392";
  for (const branch of [1, 2, 3, 4]) {
    const tries = [
      { page: 0, pageSize: 50, name: PAY_TEST_NAME },
      { page: 0, pageSize: 50, name: "Чуднова" },
      { page: 0, pageSize: 50, phone },
    ];
    for (const body of tries) {
      const json = await request<{ items?: { id?: number; name?: string }[] }>(`/v2api/${branch}/customer/index`, body, t).catch(
        () => ({ items: [] as { id?: number; name?: string }[] }),
      );
      const hit = (json.items || []).find((x) => isChudnovaAlexandra(String(x.name || "")) && Number(x.id));
      if (hit?.id) return { id: Number(hit.id), branchId: branch, name: String(hit.name || PAY_TEST_NAME) };
    }
  }
  return null;
}

async function firstRoom(
  request: typeof import("./alfacrm").request,
  t: string,
  branch: number,
  slotRoom?: number,
) {
  const { roomsOfBranchList, DEFAULT_ROOM, SEED_ROOMS } = await import("./crm-rooms");
  const { rememberRooms } = await import("./crm-rooms-disk");
  if (Number(slotRoom) && SEED_ROOMS.some((r) => r.id === Number(slotRoom) && r.branchId === branch)) return Number(slotRoom);
  const json = await request<{ items?: Record<string, unknown>[] }>(`/v2api/${branch}/room/index`, { page: 0, pageSize: 100 }, t).catch(
    () => ({ items: [] as Record<string, unknown>[] }),
  );
  const items = roomsOfBranchList(json.items || [], branch, false);
  rememberRooms(items.map((x) => ({ id: x.id, name: x.name, branchId: branch })));
  return Number(items[0]?.id) || DEFAULT_ROOM[branch] || 0;
}

export async function maybeBookChudnovaTrial() {
  if (g.__raTrialTest) return { skipped: "busy" as const };
  const mark = loadMark();
  if (mark.done === TRIAL_TEST_ID) return { skipped: "done" as const };
  g.__raTrialTest = true;
  try {
    const { token, request, resolveLessonType, formatRuDob, createAlfaLesson } = await import("./alfacrm");
    const { findDossier } = await import("./dossiers");
    const { listAdminSlots } = await import("./alfacrm-schedule");
    const { nextLocalLessonId, upsertCustomerCalendar, upsertGroupCalendar, loadCustomerCalendar, applyCreatedCalendarLesson } = await import("./group-cards");
    const { stampJournal } = await import("./crm-journal-core");
    const t = await token();
    const who = (await findChudnova(request, t)) || { id: 670, branchId: 1, name: PAY_TEST_NAME };
    const existing = loadCustomerCalendar(who.id).find((l) => Number(l.typeId) === 3 || /пробн/i.test(String(l.type || "")));
    if (existing && Number(existing.lessonId) > 0) {
      saveMark({ done: TRIAL_TEST_ID, at: new Date().toISOString(), note: `${who.name} #${who.id} пробное Alfa #${existing.lessonId}` });
      return { skipped: "exists" as const, customerId: who.id };
    }
    const d = findDossier({ crmId: who.id });
    const link = (d?.groupLinks || []).find((x) => x.active !== false) || (d?.groupLinks || [])[0];
    const gid = Number(existing && Array.isArray((existing as { groupIds?: number[] }).groupIds) ? (existing as { groupIds?: number[] }).groupIds?.[0] : 0) || Number(link?.id) || 0;
    const slot = gid
      ? listAdminSlots().find((s) => s.groupId === gid && s.branchId === who.branchId) || listAdminSlots().find((s) => s.groupId === gid)
      : listAdminSlots().find((s) => s.branchId === who.branchId && Number(s.subjectId) === TRIAL_TEST_SUBJECT);
    const fromExisting = existing
      ? {
          date: ruFromIso(existing.date) || TRIAL_TEST_DATE,
          time: String(existing.from || TRIAL_TEST_TIME),
          subjectId: Number((existing as { subjectId?: number }).subjectId) || 0,
          roomId: Number((existing as { roomId?: number }).roomId) || 0,
          teacherId: Number((existing as { teacherIds?: number[] }).teacherIds?.[0]) || 0,
        }
      : null;
    const plan = planChudnovaTrial({
      customerId: who.id,
      branchId: who.branchId,
      subjectId: fromExisting?.subjectId || Number(slot?.subjectId) || Number(link?.subjectId) || TRIAL_TEST_SUBJECT,
      gid,
      roomId: await firstRoom(request, t, who.branchId, fromExisting?.roomId || slot?.roomId),
      teacherId: fromExisting?.teacherId || Number(slot?.teacherId) || 0,
      date: fromExisting?.date || TRIAL_TEST_DATE,
      time: fromExisting?.time || TRIAL_TEST_TIME,
    });
    if (!plan) {
      g.__raTrialTest = false;
      return { ok: false as const, error: "нет плана" };
    }
    const type = resolveLessonType(plan.type)!;
    const date = formatRuDob(plan.date) || plan.date;
    const dateIso = isoFromRu(date);
    const to = addMins(plan.time, plan.duration);
    const booked = await createAlfaLesson({
      branch: plan.branchId,
      customerId: plan.customerId,
      type: "trial",
      subjectId: plan.subjectId,
      gid: plan.gid ? String(plan.gid) : undefined,
      date,
      time: plan.time,
      duration: plan.duration,
      note: plan.note,
      teacherId: plan.teacherId || undefined,
      roomId: plan.roomId || undefined,
    });
    if (!booked.ok) throw new Error(booked.error || "Alfa не создала пробное");
    const lessonId = Number(booked.id) || 0;
    if (existing && Number(existing.lessonId) < 0 && lessonId) applyCreatedCalendarLesson(Number(existing.lessonId), lessonId);
    const lessonRow = stampJournal(
      {
        date: dateIso,
        from: booked.time || plan.time,
        to,
        status: 1,
        type: booked.type || type.name,
        typeId: booked.typeId || type.id,
        duration: booked.duration || plan.duration,
        subjectId: plan.subjectId,
        teacherIds: plan.teacherId ? [plan.teacherId] : [],
        roomId: plan.roomId || undefined,
        groupIds: plan.gid ? [plan.gid] : [],
        customerIds: [plan.customerId],
        note: plan.note,
        lessonId,
        group: slot?.groupName || type.name,
        subject: slot?.subject || "Художественная школа (10-14 лет)",
        teacher: slot?.teacher || "",
      },
      [plan.customerId],
    );
    upsertCustomerCalendar(plan.customerId, lessonRow);
    if (plan.gid) {
      upsertGroupCalendar(plan.branchId, plan.gid, lessonRow, {
        name: slot?.groupName,
        subjectId: slot?.subjectId,
        subject: slot?.subject,
      });
    }
    saveMark({
      done: TRIAL_TEST_ID,
      at: new Date().toISOString(),
      note: `${who.name} #${who.id} Alfa #${lessonId} филиал ${who.branchId} · ${date} ${plan.time} ауд. ${plan.roomId || "—"}`,
    });
    logAdmin(`Пробное Чудновой: Alfa #${lessonId} ${date} ${plan.time} филиал ${who.branchId} ауд. ${plan.roomId || "—"}`, "sync");
    return { ok: true as const, customerId: who.id, branchId: who.branchId, date, time: plan.time, lessonId };
  } catch (e) {
    g.__raTrialTest = false;
    const msg = e instanceof Error ? e.message : "пробное";
    if (/no-alfacrm/.test(msg)) return { skipped: "no-alfacrm" as const };
    saveMark({ done: "", at: new Date().toISOString(), note: msg.slice(0, 400) });
    logAdmin(`Пробное Чудновой: ${msg}`, "sync");
    return { ok: false as const, error: msg };
  }
}

function isoFromRu(date: string) {
  const m = String(date).match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  return m ? `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : "2026-09-08";
}

function ruFromIso(iso: string) {
  const m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : "";
}

