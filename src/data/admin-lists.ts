import { createServerFn } from "@tanstack/react-start";
import { isAdminRequest } from "./admin-auth";
import { loadSubjects } from "./crm-subjects";
import { loadTariffs, subjectTariffStats } from "./crm-tariffs";
import { searchClientViews } from "./dossiers";

export const adminLists = createServerFn({ method: "POST" })
  .validator(
    (data: unknown) =>
      data as {
        token?: string;
        action: "subjects" | "tariffs" | "clients" | "sync" | "syncStatus";
        kind?: "subjects" | "groups" | "tariffs" | "clients" | "prices" | "all";
        q?: string;
        status?: string;
        branchId?: number;
        ageBand?: string;
      },
  )
  .handler(async ({ data }) => {
    if (!isAdminRequest(data.token)) return { ok: false as const, error: "Нужен вход администратора." };
    try {
      if (data.action === "syncStatus" || data.action === "sync") {
        const { startCrmSync, syncState, localCounts } = await import("./crm-sync");
        if (data.action === "syncStatus") return { ok: true as const, ...syncState(), local: localCounts() };
        const started = startCrmSync(data.kind || "groups");
        return { ok: true as const, ...started, local: localCounts() };
      }
      if (data.action === "subjects") {
        const { bySubject, branches } = subjectTariffStats();
        const subjects = loadSubjects().map((s) => {
          const st = bySubject.get(s.id) || { total: 0, byBranch: {} as Record<number, number>, names: [] as string[] };
          return { ...s, tariffTotal: st.total, tariffByBranch: st.byBranch, tariffNames: st.names };
        });
        return { ok: true as const, subjects, tariffBranches: branches };
      }
      if (data.action === "tariffs") {
        const store = loadTariffs();
        return {
          ok: true as const,
          at: store.at,
          tariffs: store.items.map((t) => ({ ...t, groups: [] })),
          lessonTypes: store.lessonTypes,
          branches: store.branches,
          subjects: loadSubjects(),
        };
      }
      const q = String(data.q || "").trim();
      const status = String(data.status || "").trim();
      const branchId = Number(data.branchId) || 0;
      const ageBand = String(data.ageBand || "").trim();
      const local = searchClientViews(q, 2500, status, branchId, ageBand);
      const items = local.items.map((d) => ({
        id: d.id,
        crmId: d.crmId,
        cardId: d.cardId,
        branchId: d.branchId,
        child: d.child,
        parent: d.parent,
        phone: d.phone,
        age: d.age,
        ageBand: d.ageBand,
        gender: d.gender,
        status: d.status,
        studyStatus: d.studyStatus,
        courses: d.coursesNow.length ? d.coursesNow : d.courses,
        schools: d.schools,
        city: d.city,
        branch: d.branch,
        groupLinks: d.groupLinks,
        archived: d.archived,
      }));
      return {
        ok: true as const,
        items,
        total: local.total,
        all: local.all,
        counts: local.counts,
        branchCounts: local.branchCounts,
        lastCrmSync: local.lastCrmSync,
      };
    } catch (e) {
      return { ok: false as const, error: e instanceof Error ? e.message : "Не удалось прочитать список." };
    }
  });
