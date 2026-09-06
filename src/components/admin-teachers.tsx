"use client";

import { useMemo, useState } from "react";
import { CRM_BRANCH } from "@/data/ids";
import { groupsOfTeacher, subjectsOfTeacher, type CrmTeacher } from "@/data/crm-teachers-core";
import type { CrmSlot } from "@/data/crm-slots-core";
import { cn } from "@/lib/utils";

const BRANCH_ORDER = [1, 2, 3, 4];

export function AdminTeachers({ slots, teachers }: { slots: CrmSlot[]; teachers: CrmTeacher[] }) {
  const [q, setQ] = useState("");
  const [branch, setBranch] = useState(0);
  const rows = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return teachers
      .map((t) => ({ ...t, groups: groupsOfTeacher(t.id, slots), subjects: subjectsOfTeacher(t.id, slots) }))
      .filter((t) => {
        if (branch && !(t.branchIds || []).includes(branch) && !t.groups.some((g) => g.branchId === branch)) return false;
        if (!qq) return true;
        const hay = `${t.name} ${t.id} ${t.subjects.map((s) => s.name).join(" ")} ${t.groups.map((g) => g.name).join(" ")}`.toLowerCase();
        return hay.includes(qq);
      });
  }, [teachers, slots, q, branch]);

  return (
    <div className="rounded-3xl bg-surface p-5 shadow-[var(--shadow-border)]">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <p className="font-display text-xl">Педагоги</p>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Ученик → филиал. Педагог → группа (teacherId). Предмет и расписание — у группы. Филиал педагога считается по его группам.
          </p>
        </div>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="имя, id, предмет, группа"
          className="ml-auto h-9 w-56 rounded-full bg-white px-3 text-sm ring-1 ring-black/10"
        />
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {[{ id: 0, short: "Все" }, ...BRANCH_ORDER.map((id) => ({ id, short: CRM_BRANCH[id]?.short || String(id) }))].map((b) => (
          <button
            key={b.id}
            type="button"
            onClick={() => setBranch(b.id)}
            className={cn(
              "rounded-full px-3 py-1 text-[0.78rem] font-semibold ring-1",
              branch === b.id ? "bg-primary text-white ring-primary" : "bg-white text-fg ring-black/10",
            )}
          >
            {b.short}
          </button>
        ))}
      </div>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-left text-[0.88rem]">
          <thead className="text-[0.72rem] uppercase tracking-wider text-muted">
            <tr>
              <th className="px-2 py-2">ID</th>
              <th className="px-2 py-2">Педагог</th>
              <th className="px-2 py-2">Филиалы</th>
              <th className="px-2 py-2">Предметы</th>
              <th className="px-2 py-2">Группы · расписание</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => (
              <tr key={t.id} className="border-t border-black/6 align-top">
                <td className="px-2 py-2 font-semibold tabular-nums text-muted">{t.id}</td>
                <td className="px-2 py-2 font-medium">{t.name}</td>
                <td className="px-2 py-2 text-muted">
                  {(t.branchIds || []).map((id) => CRM_BRANCH[id]?.short || id).join(" · ") || "—"}
                </td>
                <td className="px-2 py-2 text-muted">
                  {t.subjects.length ? t.subjects.map((s) => s.name).join(" · ") : "—"}
                </td>
                <td className="px-2 py-2 text-muted">
                  {t.groups.length ? (
                    <ul className="space-y-1">
                      {t.groups
                        .filter((g) => !branch || g.branchId === branch)
                        .map((g) => (
                          <li key={`${g.branchId}:${g.groupId}`}>
                            <span className="font-medium text-fg">{g.name}</span>
                            <span className="text-muted">
                              {" "}
                              · {CRM_BRANCH[g.branchId]?.short || g.branchId} · {g.groupId}
                              {g.subject ? ` · ${g.subject}` : ""}
                              {g.day && g.from ? ` · ${g.day} ${g.from}${g.to ? `–${g.to}` : ""}` : ""}
                            </span>
                          </li>
                        ))}
                    </ul>
                  ) : (
                    "нет группы на сайте"
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length ? (
          <p className="px-2 py-6 text-sm text-muted">Нет педагогов в этой выборке. Загрузите группы — список соберётся с teacherId.</p>
        ) : null}
      </div>
      <p className="mt-3 text-[0.75rem] text-muted">
        {rows.length} педагогов · связи: teacherId группы, subjectId группы, branchId группы, день/время слота.
      </p>
    </div>
  );
}
