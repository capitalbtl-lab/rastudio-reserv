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
  if (Number(slotRoom)) return Number(slotRoom);
  const json = await request<{ items?: { id?: number; branch_id?: number }[] }>(
    `/v2api/${branch}/room/index`,
    { page: 0, pageSize: 50 },
    t,
  ).catch(() => ({ items: [] as { id?: number }[] }));
  const hit = (json.items || []).find((x) => Number(x.id) && (Number(x.branch_id) === branch || !x.branch_id));
  return Number(hit?.id) || 0;
}

export async function maybeBookChudnovaTrial() {
  if (g.__raTrialTest) return { skipped: "busy" as const };
  const mark = loadMark();
  if (mark.done === TRIAL_TEST_ID) return { skipped: "done" as const };
  g.__raTrialTest = true;
  try {
    const { token, request, resolveLessonType, formatRuDob } = await import("./alfacrm");
    const t = await token();
    const who = await findChudnova(request, t);
    if (!who) {
      saveMark({ done: "", at: new Date().toISOString(), note: "не нашла Чуднову Александру" });
      logAdmin("Пробное Чудновой: клиента в Alfa не нашла", "sync");
      g.__raTrialTest = false;
      return { ok: false as const, error: "нет клиента" };
    }
    const { findDossier } = await import("./dossiers");
    const { listAdminSlots } = await import("./alfacrm-schedule");
    const { nextLocalLessonId, upsertCustomerCalendar, upsertGroupCalendar, loadCustomerCalendar } = await import("./group-cards");
    const { stampJournal } = await import("./crm-journal-core");
    const { enqueueExport, tickExportQueue } = await import("./crm-export-queue");
    const already = loadCustomerCalendar(who.id).some((l) => Number(l.typeId) === 3 || /пробн/i.test(String(l.type || "")));
    if (already) {
      saveMark({ done: TRIAL_TEST_ID, at: new Date().toISOString(), note: `${who.name} #${who.id} уже есть пробное на диске` });
      return { skipped: "exists" as const, customerId: who.id };
    }
    const d = findDossier({ crmId: who.id });
    const link = (d?.groupLinks || []).find((x) => x.active !== false) || (d?.groupLinks || [])[0];
    const gid = Number(link?.id) || 0;
    const slot = gid
      ? listAdminSlots().find((s) => s.groupId === gid && s.branchId === who.branchId) || listAdminSlots().find((s) => s.groupId === gid)
      : listAdminSlots().find((s) => s.branchId === who.branchId && Number(s.subjectId) === TRIAL_TEST_SUBJECT);
    const plan = planChudnovaTrial({
      customerId: who.id,
      branchId: who.branchId,
      subjectId: Number(slot?.subjectId) || Number(link?.subjectId) || TRIAL_TEST_SUBJECT,
      gid,
      roomId: await firstRoom(request, t, who.branchId, slot?.roomId),
      teacherId: Number(slot?.teacherId) || 0,
      date: TRIAL_TEST_DATE,
      time: TRIAL_TEST_TIME,
    });
    if (!plan) return { ok: false as const, error: "нет плана" };
    const type = resolveLessonType(plan.type)!;
    const date = formatRuDob(plan.date) || plan.date;
    const dateIso = (() => {
      const m = String(date).match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
      return m ? `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : "2026-09-08";
    })();
    const to = addMins(plan.time, plan.duration);
    const localId = nextLocalLessonId();
    const lessonRow = stampJournal(
      {
        date: dateIso,
        from: plan.time,
        to,
        status: 1,
        type: type.name,
        typeId: type.id,
        duration: plan.duration,
        subjectId: plan.subjectId,
        teacherIds: plan.teacherId ? [plan.teacherId] : [],
        roomId: plan.roomId || undefined,
        groupIds: plan.gid ? [plan.gid] : [],
        customerIds: [plan.customerId],
        note: plan.note,
        lessonId: localId,
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
    enqueueExport({
      op: "lesson.create",
      branchId: plan.branchId,
      entityId: plan.customerId,
      body: {
        localId,
        type: plan.type,
        lesson_type_id: type.id,
        lesson_date: date,
        time_from: plan.time,
        time_to: to,
        duration: plan.duration,
        subject_id: plan.subjectId,
        customer_ids: [plan.customerId],
        ...(plan.roomId ? { room_id: plan.roomId } : {}),
        ...(plan.gid ? { group_ids: [plan.gid] } : {}),
        ...(plan.teacherId ? { teacher_ids: [plan.teacherId] } : {}),
        note: plan.note,
      },
    });
    saveMark({
      done: TRIAL_TEST_ID,
      at: new Date().toISOString(),
      note: `${who.name} #${who.id} филиал ${who.branchId} · ${date} ${plan.time}`,
    });
    logAdmin(`Пробное Чудновой: #${who.id} ${date} ${plan.time} на диске, очередь AlfaCRM`, "sync");
    await tickExportQueue(2);
    return { ok: true as const, customerId: who.id, branchId: who.branchId, date, time: plan.time, lessonId: localId };
  } catch (e) {
    g.__raTrialTest = false;
    const msg = e instanceof Error ? e.message : "пробное";
    if (/no-alfacrm/.test(msg)) return { skipped: "no-alfacrm" as const };
    logAdmin(`Пробное Чудновой: ${msg}`, "sync");
    return { ok: false as const, error: msg };
  }
}
