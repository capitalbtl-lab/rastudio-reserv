import { createServerFn } from "@tanstack/react-start";
import { isAdminRequest } from "./admin-auth";
import { logAdmin } from "./admin-settings";
import {
  crmScheduleMeta,
  listAdminSlots,
  refreshCrmSchedule,
  saveAdminSlots,
  sessionsFromCrm,
} from "./alfacrm-schedule";
import {
  aiSchedulePatch,
  applyChanges,
  loadVersions,
  parseSlotsCsv,
  pushSlotsToCrm,
  pushVersion,
  slotsToCsv,
  slotsToXls,
  versionSlots,
  type CrmSlot,
} from "./crm-slots";

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
          | "students";
        slots?: CrmSlot[];
        text?: string;
        prompt?: string;
        changes?: { id: string; field: string; to: string }[];
        dirtyIds?: string[];
        ids?: string[];
        groupId?: number;
        branchId?: number;
        at?: string;
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
      return pack(slots);
    }
    if (data.action === "pull") {
      try {
        const res = await refreshCrmSchedule();
        pushVersion("Загрузка из AlfaCRM", res.slots);
        logAdmin(`Расписание из AlfaCRM: ${res.count} слотов`);
        return pack(res.slots);
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
      const slots = data.slots?.length ? saveAdminSlots(data.slots).slots : listAdminSlots();
      const results = await pushSlotsToCrm(slots, data.dirtyIds);
      const ok = results.filter((r) => r.ok).length;
      logAdmin(`Выгрузка в AlfaCRM: ${ok}/${results.length}`);
      return pack(slots, { results, pushed: ok });
    }
    if (data.action === "aiPreview") {
      const slots = listAdminSlots();
      const ids = Array.isArray(data.ids) ? data.ids.map(String) : [];
      const subset = ids.length ? slots.filter((s) => ids.includes(s.id)) : [];
      if (!subset.length) {
        return pack(slots, { comment: "Отметьте группы чекбоксом слева или нажмите «Выделить всё».", changes: [] });
      }
      const preview = await aiSchedulePatch(subset, String(data.prompt || ""));
      return pack(slots, preview);
    }
    if (data.action === "aiApply") {
      const ids = new Set((data.ids || []).map(String));
      const allowed = ids.size ? (data.changes || []).filter((c) => ids.has(c.id)) : [];
      if (!allowed.length) {
        return pack(listAdminSlots(), { comment: "Нет отмеченных групп — ничего не применил.", changes: [] });
      }
      const next = applyChanges(listAdminSlots(), allowed);
      const saved = saveAdminSlots(next).slots;
      pushVersion(`ИИ: ${(data.prompt || "правка").slice(0, 80)}`, saved);
      logAdmin("Расписание: ИИ-правка применена");
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
