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
      return {
        ok: true as const,
        subjects: loadSubjects(),
        group: {
          id: gid,
          name: String(g.name || ""),
          note: String(g.note || ""),
          hashtags: String(g.custom_hashtagkursa || ""),
          makeup: String(g.custom_workingout || ""),
          statusId: Number(g.status_id || 0),
          signup: slot?.signup || `https://studiyarazvivaysya.s20.online/common/${branch}/lead/create?gid=${gid}`,
          subjectId: Number(slot?.subjectId || 0),
          subject: slot?.subject || "",
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
      const note = String(data.note || "");
      const hashtags = String(data.hashtags || "");
      const makeup = String(data.makeup || "");
      const statusId = Number(data.statusId || 0);
      await request(`/v2api/${branch}/group/update`, {
        id: gid,
        note,
        status_id: statusId || undefined,
        custom_hashtagkursa: hashtags,
        custom_workingout: makeup,
      }, t);
      const current = listAdminSlots();
      const subject = loadSubjects().find((x) => x.id === subjectId);
      const next = current.map((s) => {
        if (s.groupId !== gid || s.branchId !== branch) return s;
        return {
          ...s,
          groupNote: note,
          hashtags,
          makeup,
          statusId: statusId || s.statusId,
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
