import { createServerFn } from "@tanstack/react-start";
import { isAdminRequest } from "./admin-auth";
import { logAdmin } from "./admin-settings";
import {
  crmScheduleMeta,
  listAdminSlots,
  refreshCrmSchedule,
  saveAdminSlots,
  sessionsFromCrm,
  bindSubjectsOnSite,
} from "./alfacrm-schedule";
import {
  aiScheduleParse,
  applyChanges,
  buildSlot,
  loadVersions,
  parseSlotsCsv,
  pushSlotsToCrm,
  pushVersion,
  slotsToCsv,
  slotsToXls,
  versionSlots,
  type CrmSlot,
  type SlotDraft,
} from "./crm-slots";
import { loadSubjects, saveSubjects, pullSubjectsFromCrm, pushSubjectsToCrm } from "./crm-subjects";
import type { GroupCalLesson } from "./crm-slots-core";
import { rememberLessons } from "./crm-lessons";

function ymd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function hm(raw?: string) {
  const m = String(raw || "").match(/(\d{1,2}):(\d{2})/);
  return m ? `${m[1].padStart(2, "0")}:${m[2]}` : "";
}

function durationMins(from: string, to: string) {
  const a = from.split(":").map(Number);
  const b = to.split(":").map(Number);
  if (a.length < 2 || b.length < 2) return 0;
  const n = b[0] * 60 + b[1] - (a[0] * 60 + a[1]);
  return n > 0 && n <= 480 ? n : 0;
}

function packCrmLesson(
  item: {
    id?: number;
    date?: string;
    time_from?: string;
    time_to?: string;
    status?: number;
    lesson_type_id?: number;
    lesson_type_name?: string;
    room_id?: number | null;
    teacher_ids?: number[];
    subject_id?: number;
    topic?: string | null;
    homework?: string | null;
    details?: { is_attend?: number | null }[];
    customer_ids?: number[];
  },
  ctx: {
    rooms: Map<number, string>;
    teachers: Map<number, string>;
    subjects: Map<number, string>;
    groupName: string;
    fallbackFrom: string;
    fallbackTo: string;
    fallbackTeacher: string;
  },
): GroupCalLesson | null {
  const date = String(item.date || "").slice(0, 10);
  if (!date) return null;
  const from = hm(item.time_from) || ctx.fallbackFrom;
  const to = hm(item.time_to) || ctx.fallbackTo;
  const teacher = (item.teacher_ids || []).map((id) => ctx.teachers.get(Number(id)) || "").filter(Boolean).join(", ") || ctx.fallbackTeacher;
  const attend = (item.details || []).filter((d) => d.is_attend === 1).length;
  const total = (item.details || []).length || (item.customer_ids || []).length;
  return {
    date,
    from,
    to,
    status: Number(item.status || 0),
    type: String(item.lesson_type_name || "Групповое"),
    typeId: Number(item.lesson_type_id || 0) || undefined,
    duration: durationMins(from, to),
    room: item.room_id ? ctx.rooms.get(Number(item.room_id)) || "" : "",
    teacher,
    subject: item.subject_id ? ctx.subjects.get(Number(item.subject_id)) || "" : "",
    group: ctx.groupName,
    topic: String(item.topic || "").trim(),
    homework: String(item.homework || "").trim(),
    attend,
    total,
    lessonId: Number(item.id || 0) || undefined,
  };
}

function expandWeekday(day: number, from: string, to: string, start: Date, end: Date): GroupCalLesson[] {
  if (!day) return [];
  const want = day === 7 ? 0 : day;
  const cur = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  while (cur.getDay() !== want) cur.setDate(cur.getDate() + 1);
  const out: GroupCalLesson[] = [];
  while (cur <= end) {
    out.push({ date: ymd(cur), from, to, status: 1, type: "Групповое" });
    cur.setDate(cur.getDate() + 7);
  }
  return out;
}

const SEED_LEVELS = [
  { id: 7, name: "1 класс" },
  { id: 8, name: "2 класс" },
  { id: 9, name: "3 класс" },
  { id: 10, name: "4 класс" },
  { id: 11, name: "5 класс" },
  { id: 15, name: "Ознакомительный" },
  { id: 12, name: "Начальный" },
  { id: 13, name: "Средний" },
  { id: 14, name: "Продвинутый" },
];

async function fetchLevels(t: string, branch: number) {
  const { request } = await import("./alfacrm");
  const paths = [`/v2api/${branch}/level/index`, `/v2api/2/level/index`, `/v2api/level/index`];
  for (const path of paths) {
    try {
      const json = await request<{ items?: { id?: number; name?: string }[] }>(path, { page: 0, pageSize: 100 }, t);
      const items = (json.items || [])
        .map((x) => ({ id: Number(x.id), name: String(x.name || "").trim() }))
        .filter((x) => x.id && x.name);
      if (items.length) return items;
    } catch {
      /* next path */
    }
  }
  return SEED_LEVELS;
}

export const adminSchedule = createServerFn({ method: "POST" })
  .validator(
    (data: unknown) =>
      data as {
        token?: string;
        action:
          | "get"
          | "pull"
          | "save"
          | "exportCsv"
          | "exportXls"
          | "import"
          | "push"
          | "aiPreview"
          | "aiApply"
          | "versions"
          | "rollback"
          | "students"
          | "add"
          | "remove"
          | "subjectsGet"
          | "subjectsPull"
          | "subjectsSave"
          | "subjectsPush"
          | "groupGet"
          | "groupSave";
        slots?: CrmSlot[];
        text?: string;
        prompt?: string;
        changes?: { id: string; field: string; to: string }[];
        adds?: SlotDraft[];
        draft?: SlotDraft;
        dirtyIds?: string[];
        ids?: string[];
        groupId?: number;
        branchId?: number;
        at?: string;
        subjects?: { id: number; name: string; local?: boolean }[];
        note?: string;
        hashtags?: string;
        makeup?: string;
        statusId?: number;
        subjectId?: number;
        description?: string;
        remarks?: string;
        bDate?: string;
        eDate?: string;
        levelId?: number;
      },
  )
  .handler(async ({ data }) => {
    if (!isAdminRequest(data.token)) return { ok: false as const, error: "Нужен вход администратора." };
    const pack = (slots: CrmSlot[], extra?: Record<string, unknown>) => {
      const meta = crmScheduleMeta();
      return {
        ok: true as const,
        at: meta.at,
        count: slots.length,
        slots,
        versions: loadVersions().map((v) => ({ at: v.at, reason: v.reason, count: v.count })),
        ...extra,
      };
    };
    if (data.action === "get") {
      let slots = listAdminSlots();
      if (!slots.length) {
        try {
          await sessionsFromCrm();
          slots = listAdminSlots();
        } catch {
          /* */
        }
      }
      const bound = bindSubjectsOnSite();
      if (bound.changed) logAdmin(`Предметы привязаны к группам на сайте: ${bound.slots.length}`);
      return pack(bound.slots);
    }
    if (data.action === "pull") {
      try {
        const res = await refreshCrmSchedule();
        pushVersion("Загрузка из AlfaCRM", res.slots);
        logAdmin(`Расписание из AlfaCRM: +${res.added} новых, ${res.updated} обновлено, всего ${res.count}`);
        return pack(res.slots, { added: res.added, updated: res.updated });
      } catch (e) {
        return { ok: false as const, error: e instanceof Error ? e.message : "AlfaCRM не ответила." };
      }
    }
    if (data.action === "save") {
      const slots = saveAdminSlots(data.slots || listAdminSlots()).slots;
      pushVersion("Правка в кабинете", slots);
      logAdmin("Расписание сохранено на сайте");
      return pack(slots);
    }
    if (data.action === "exportCsv") {
      return { ok: true as const, filename: "raspisanije.csv", mime: "text/csv", text: slotsToCsv(listAdminSlots()) };
    }
    if (data.action === "exportXls") {
      return {
        ok: true as const,
        filename: "raspisanije.xls",
        mime: "application/vnd.ms-excel",
        text: slotsToXls(listAdminSlots()),
      };
    }
    if (data.action === "import") {
      const next = parseSlotsCsv(String(data.text || ""), listAdminSlots());
      const saved = saveAdminSlots(next).slots;
      pushVersion("Импорт Excel/CSV", saved);
      logAdmin(`Импорт расписания: ${saved.length} строк`);
      return pack(saved);
    }
    if (data.action === "push") {
      const ids = (data.ids || data.dirtyIds || []).map(String);
      if (!ids.length) return { ok: false as const, error: "Отметьте группы чекбоксом слева от названия." };
      const current = data.slots?.length ? data.slots : listAdminSlots();
      const { results, slots: next } = await pushSlotsToCrm(current, ids);
      const saved = saveAdminSlots(next).slots;
      const ok = results.filter((r) => r.ok).length;
      const created = results.filter((r) => r.ok && r.created).length;
      logAdmin(`Выгрузка в AlfaCRM: ${ok}/${results.length}, новых gid: ${created}`);
      return pack(saved, { results, pushed: ok, created, failed: results.length - ok });
    }
    if (data.action === "aiPreview") {
      const slots = listAdminSlots();
      const ids = Array.isArray(data.ids) ? data.ids.map(String) : [];
      const prompt = String(data.prompt || "");
      const preview = await aiScheduleParse(slots, prompt, ids);
      return pack(slots, preview);
    }
    if (data.action === "aiApply") {
      const slots = listAdminSlots();
      const ids = new Set((data.ids || []).map(String));
      const incoming = data.changes || [];
      const allowed = ids.size ? incoming.filter((c) => ids.has(c.id)) : incoming;
      const drafts = data.adds || [];
      if (!allowed.length && !drafts.length) {
        return { ok: false as const, error: "В предпросмотре нет правок. Нажмите стрелку отправки, затем «Опубликовать изменения»." };
      }
      let next = allowed.length ? applyChanges(slots, allowed) : slots.map((s) => ({ ...s }));
      const created: string[] = [];
      for (const d of drafts) {
        const slot = buildSlot(d, next);
        next = [...next, slot];
        created.push(slot.id);
      }
      const saved = saveAdminSlots(next).slots;
      const applied = [...new Set(allowed.map((c) => c.id).concat(created))];
      pushVersion(`ИИ: ${(data.prompt || "правка").slice(0, 80)}`, saved);
      logAdmin(`Расписание: ИИ ${allowed.length} правок, ${created.length} новых`);
      return pack(saved, { created, applied });
    }
    if (data.action === "add" && data.draft) {
      const slots = listAdminSlots();
      const slot = buildSlot(data.draft, slots);
      const saved = saveAdminSlots([...slots, slot]).slots;
      pushVersion(`Новая группа: ${slot.course}`, saved);
      logAdmin(`Расписание: добавлена ${slot.groupName}`);
      return pack(saved, { created: [slot.id] });
    }
    if (data.action === "remove") {
      const ids = new Set((data.ids || []).map(String));
      if (!ids.size) return pack(listAdminSlots(), { comment: "Нечего удалять." });
      const slots = listAdminSlots();
      const saved = saveAdminSlots(slots.filter((s) => !ids.has(s.id))).slots;
      pushVersion(`Удалено групп: ${ids.size}`, saved);
      logAdmin(`Расписание: удалено ${ids.size}`);
      return pack(saved);
    }
    if (data.action === "students") {
      const { token, request } = await import("./alfacrm");
      const t = await token();
      const branch = Number(data.branchId) || 1;
      const gid = Number(data.groupId) || 0;
      if (!gid) return { ok: true as const, names: [] as string[] };
      const json = await request<{ items?: { id?: number; name?: string; is_study?: number; dob?: string }[] }>(
        `/v2api/${branch}/customer/index`,
        { page: 0, pageSize: 80, group_id: gid, is_study: 1 },
        t,
      ).catch(async () =>
        request<{ items?: { id?: number; name?: string; is_study?: number; dob?: string }[] }>(
          `/v2api/${branch}/customer/index`,
          { page: 0, pageSize: 80, group_ids: [gid] },
          t,
        ),
      );
      const names = (json.items || [])
        .filter((c) => Number(c.is_study) !== 2)
        .map((c) => String(c.name || "").trim())
        .filter(Boolean);
      return { ok: true as const, names };
    }
    if (data.action === "versions") return pack(listAdminSlots());
    if (data.action === "subjectsGet") {
      return { ok: true as const, subjects: loadSubjects() };
    }
    if (data.action === "subjectsPull") {
      try {
        const subjects = await pullSubjectsFromCrm();
        logAdmin(`Предметы из AlfaCRM: ${subjects.length}`);
        return { ok: true as const, subjects };
      } catch (e) {
        return { ok: false as const, error: e instanceof Error ? e.message : "Не удалось загрузить предметы." };
      }
    }
    if (data.action === "subjectsSave") {
      const subjects = saveSubjects(data.subjects || []);
      logAdmin(`Предметы сохранены: ${subjects.length}`);
      return { ok: true as const, subjects };
    }
    if (data.action === "subjectsPush") {
      try {
        const res = await pushSubjectsToCrm(data.subjects || loadSubjects());
        logAdmin(`Предметы в AlfaCRM: ${res.results.filter((r) => r.ok).length}`);
        return { ok: true as const, subjects: res.items, results: res.results };
      } catch (e) {
        return { ok: false as const, error: e instanceof Error ? e.message : "Не удалось выгрузить предметы." };
      }
    }
    if (data.action === "groupGet") {
      const { token, request } = await import("./alfacrm");
      const t = await token();
      const branch = Number(data.branchId) || 1;
      const gid = Number(data.groupId) || 0;
      if (!gid) return { ok: false as const, error: "Нет номера группы." };
      const json = await request<{ items?: Record<string, unknown>[] }>(`/v2api/${branch}/group/index`, { page: 0, pageSize: 100 }, t);
      const g = (json.items || []).find((x) => Number(x.id) === gid);
      if (!g) return { ok: false as const, error: "Группа не найдена в AlfaCRM." };
      const slot = listAdminSlots().find((s) => s.groupId === gid && s.branchId === branch);
      const byDate = new Map<string, GroupCalLesson>();
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const winStart = new Date(today);
      winStart.setDate(winStart.getDate() - 84);
      const winEnd = new Date(today);
      winEnd.setDate(winEnd.getDate() + 84);
      try {
        const rooms = new Map<number, string>();
        const teachers = new Map<number, string>();
        const subjects = new Map<number, string>(loadSubjects().map((s) => [s.id, s.name]));
        try {
          const rm = await request<{ items?: { id?: number; name?: string; note?: string }[] }>(`/v2api/${branch}/room/index`, { page: 0, pageSize: 100 }, t);
          for (const x of rm.items || []) {
            const id = Number(x.id || 0);
            if (!id) continue;
            const name = String(x.name || "").trim();
            const note = String(x.note || "").split("|")[0].trim();
            rooms.set(id, note ? `${name} · ${note}` : name);
          }
        } catch { /* rooms optional */ }
        try {
          for (let page = 0; page < 4; page++) {
            const pack = await request<{ items?: { id?: number; name?: string }[] }>(`/v2api/${branch}/teacher/index`, { page, pageSize: 100 }, t);
            const chunk = pack.items || [];
            for (const x of chunk) if (x.id) teachers.set(Number(x.id), String(x.name || "").trim());
            if (chunk.length < 100) break;
          }
        } catch { /* teachers optional */ }
        const regs: {
          id?: number;
          related_id?: number;
          day?: number;
          time_from_v?: string;
          time_to_v?: string;
        }[] = [];
        for (let page = 0; page < 8; page++) {
          const pack = await request<{ items?: typeof regs }>(`/v2api/${branch}/regular-lesson/index`, { page, pageSize: 100 }, t);
          const chunk = pack.items || [];
          regs.push(...chunk);
          if (chunk.length < 100) break;
        }
        const mine = regs.filter((r) => Number(r.related_id) === gid);
        const groupName = String(g.name || slot?.groupName || "");
        const fallbackTeacher = String(slot?.teacher || "");
        for (const r of mine) {
          const from = hm(r.time_from_v);
          const to = hm(r.time_to_v);
          for (const occ of expandWeekday(Number(r.day || 0), from, to, winStart, winEnd)) {
            occ.group = groupName;
            occ.teacher = fallbackTeacher;
            occ.subject = slot?.subject || "";
            occ.duration = durationMins(from, to);
            byDate.set(occ.date, occ);
          }
          if (!r.id) continue;
          const ctx = { rooms, teachers, subjects, groupName, fallbackFrom: from, fallbackTo: to, fallbackTeacher };
          for (const status of [1, 2, 3]) {
            for (let page = 0; page < 6; page++) {
              const les = await request<{ items?: Parameters<typeof packCrmLesson>[0][] }>(
                `/v2api/${branch}/lesson/index`,
                { page, pageSize: 100, regular_id: r.id, status },
                t,
              );
              const chunk = les.items || [];
              for (const item of chunk) {
                const packed = packCrmLesson(item, ctx);
                if (packed) byDate.set(packed.date, packed);
              }
              if (chunk.length < 100) break;
            }
          }
        }
      } catch {
        /* календарь не должен ломать карточку */
      }
      if (!byDate.size && slot) {
        const beats = slot.beats?.length ? slot.beats : [{ day: slot.day, timeFrom: slot.timeFrom, timeTo: slot.timeTo }];
        for (const b of beats) {
          for (const occ of expandWeekday(Number(b.day || slot.day || 0), String(b.timeFrom || ""), String(b.timeTo || ""), winStart, winEnd)) {
            byDate.set(occ.date, occ);
          }
        }
      }
      const calendar = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
      rememberLessons(calendar);
      const levels = await fetchLevels(t, branch).catch(() => SEED_LEVELS);
      return {
        ok: true as const,
        subjects: loadSubjects(),
        levels,
        group: {
          id: gid,
          name: String(g.name || ""),
          note: String(g.note || ""),
          description: String(g.note || ""),
          remarks: slot?.remarks || "",
          hashtags: String(g.custom_hashtagkursa || "").replace(/\s+/g, " ").trim(),
          makeup: String(g.custom_workingout || ""),
          statusId: Number(g.status_id || 0),
          bDate: String(g.b_date || slot?.bDate || ""),
          eDate: String(g.e_date || slot?.eDate || ""),
          levelId: Number(g.level_id || slot?.levelId || 0),
          signup: slot?.signup || `https://studiyarazvivaysya.s20.online/common/${branch}/lead/create?gid=${gid}`,
          subjectId: Number(slot?.subjectId || 0),
          subject: slot?.subject || "",
          calendar,
        },
      };
    }
    if (data.action === "groupSave") {
      const { token, request } = await import("./alfacrm");
      const t = await token();
      const branch = Number(data.branchId) || 1;
      const gid = Number(data.groupId) || 0;
      if (!gid) return { ok: false as const, error: "Нет номера группы." };
      const subjectId = Number(data.subjectId || 0);
      const description = String(data.description ?? data.note ?? "");
      const remarks = String(data.remarks || "");
      const hashtags = String(data.hashtags || "");
      const makeup = String(data.makeup || "");
      const statusId = Number(data.statusId || 0);
      const bDate = String(data.bDate || "");
      const eDate = String(data.eDate || "");
      const levelId = Number(data.levelId || 0);
      await request(`/v2api/${branch}/group/update`, {
        id: gid,
        note: description,
        status_id: statusId || undefined,
        custom_hashtagkursa: hashtags,
        custom_workingout: makeup,
        ...(bDate ? { b_date: bDate } : {}),
        ...(eDate ? { e_date: eDate } : {}),
        ...(levelId ? { level_id: levelId } : { level_id: null }),
      }, t);
      const current = listAdminSlots();
      const subject = loadSubjects().find((x) => x.id === subjectId);
      const next = current.map((s) => {
        if (s.groupId !== gid || s.branchId !== branch) return s;
        return {
          ...s,
          groupNote: description,
          description,
          remarks,
          hashtags,
          makeup,
          statusId: statusId || s.statusId,
          bDate: bDate || s.bDate,
          eDate: eDate || s.eDate,
          levelId: levelId || s.levelId,
          subjectId: subjectId || s.subjectId,
          subject: subject?.name || s.subject,
        };
      });
      if (subjectId) {
        const slot = next.find((s) => s.groupId === gid && s.branchId === branch);
        for (const b of slot?.beats || []) {
          if (!b.lessonId) continue;
          await request(`/v2api/${branch}/regular-lesson/update`, { id: b.lessonId, related_id: gid, subject_id: subjectId }, t).catch(() => null);
        }
      }
      const saved = saveAdminSlots(next).slots;
      logAdmin(`Группа ${gid}: подробности сохранены в AlfaCRM`);
      return pack(saved);
    }
    if (data.action === "rollback" && data.at) {
      const prev = versionSlots(data.at);
      if (!prev) return { ok: false as const, error: "Снимок не найден." };
      const saved = saveAdminSlots(prev).slots;
      pushVersion(`Откат к ${data.at}`, saved);
      logAdmin("Расписание: откат версии");
      return pack(saved);
    }
    return { ok: false as const, error: "Неизвестное действие." };
  });
