"use client";

import { useEffect, useState } from "react";
import { adminSchedule } from "@/data/admin-schedule";
import { Button } from "@/components/ui/button";
import { InfoTip } from "@/components/info-tip";
import { TipWrap } from "@/components/info-tip";
import type { CrmSubject } from "@/data/crm-subjects";

function token() {
  if (typeof document === "undefined") return "";
  const m = document.cookie.match(/(?:^|;\s*)ra_admin=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : localStorage.getItem("ra_admin") || "";
}

export function AdminSubjects() {
  const [items, setItems] = useState<CrmSubject[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function run(action: "subjectsGet" | "subjectsPull" | "subjectsSave" | "subjectsPush", extra?: { subjects?: CrmSubject[] }) {
    setBusy(true);
    const res = await adminSchedule({ data: { token: token(), action, ...extra } as never });
    setBusy(false);
    if (!res.ok) {
      setMsg(res.error || "Ошибка");
      return;
    }
    if ("subjects" in res && Array.isArray(res.subjects)) setItems(res.subjects as CrmSubject[]);
    return res;
  }

  useEffect(() => {
    void run("subjectsGet");
  }, []);

  function patch(i: number, field: "id" | "name", value: string) {
    setItems((list) => list.map((s, n) => (n === i ? { ...s, [field]: field === "id" ? Number(value) || 0 : value } : s)));
  }

  return (
    <section className="space-y-4">
      <p className="max-w-3xl text-sm text-muted">
        Предмет AlfaCRM — обязательное поле при создании группы и регулярного урока. Название предмета должно совпадать с курсом. ID берётся из CRM.
      </p>
      <div className="flex flex-wrap gap-2">
        <TipWrap text="subject/index из AlfaCRM. Справочник с сайта дополняется, существующие id не затираются зря.">
          <Button type="button" variant="secondary" disabled={busy} onClick={async () => { await run("subjectsPull"); setMsg("Предметы подтянуты из AlfaCRM."); }}>
            Загрузить из AlfaCRM
          </Button>
        </TipWrap>
        <TipWrap text="Пишет storage/crm-subjects.json. Расписание сопоставляет курс с предметом по названию.">
          <Button type="button" variant="secondary" disabled={busy} onClick={async () => { await run("subjectsSave", { subjects: items }); setMsg("Справочник сохранён на сайте."); }}>
            Сохранить на сайте
          </Button>
        </TipWrap>
        <TipWrap text="Новые без id создаются в CRM, остальные — update имени.">
          <Button type="button" variant="secondary" disabled={busy} onClick={async () => { const res = await run("subjectsPush", { subjects: items }); if (res?.ok) setMsg("Выгружено в AlfaCRM."); }}>
            Выгрузить в AlfaCRM
          </Button>
        </TipWrap>
        <Button
          type="button"
          disabled={busy}
          onClick={() => setItems((list) => [...list, { id: 0, name: "", local: true }])}
        >
          Добавить предмет
        </Button>
      </div>
      {msg ? <p className="text-sm text-primary">{msg}</p> : null}
      <div className="overflow-hidden rounded-3xl bg-surface shadow-[var(--shadow-border)]">
        <table className="w-full text-left text-sm">
          <thead className="text-[0.65rem] uppercase tracking-wider text-muted">
            <tr>
              <th className="w-24 px-4 py-3">ID</th>
              <th className="px-4 py-3">
                Название предмета
                <InfoTip text="Точно как в AlfaCRM. По этому имени расписание выбирает subject_id для группы." />
              </th>
              <th className="w-10 px-2 py-3" />
            </tr>
          </thead>
          <tbody>
            {items.map((s, i) => (
              <tr key={`${s.id}-${i}`} className="border-t border-black/6">
                <td className="px-4 py-2">
                  <input value={s.id || ""} onChange={(e) => patch(i, "id", e.target.value)} className="h-9 w-20 rounded-xl bg-surface-2 px-2 text-center ring-1 ring-black/10" />
                </td>
                <td className="px-4 py-2">
                  <input value={s.name} onChange={(e) => patch(i, "name", e.target.value)} className="h-9 w-full rounded-xl bg-surface-2 px-3 ring-1 ring-black/10" />
                </td>
                <td className="px-2 py-2">
                  <button type="button" className="text-muted hover:text-red-600" onClick={() => setItems((list) => list.filter((_, n) => n !== i))}>
                    ×
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
