"use client";

import { useEffect, useState } from "react";
import { adminApiKeys, type ApiConn, type ApiKind } from "@/data/api-keys";
import { Button } from "@/components/ui/button";
import { InfoTip } from "@/components/info-tip";
import { AdminSaveBar } from "@/components/admin-save-bar";
import { AdminSectionHead } from "@/components/admin-self-test";
import { cn } from "@/lib/utils";

function token() {
  if (typeof document === "undefined") return "";
  const m = document.cookie.match(/(?:^|;\s*)ra_admin=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : localStorage.getItem("ra_admin") || "";
}

const KIND_RU: Record<ApiKind, string> = {
  llm: "Модель ИИ",
  telephony: "Телефония",
  crm: "CRM",
  messenger: "Мессенджер",
  other: "Другой сервис",
};

const GROUPS: { kind: ApiKind; title: string; tip: string }[] = [
  { kind: "llm", title: "Модели ИИ", tip: "YandexGPT — если в диалоге персональные данные (ФИО, телефон, запись). DeepSeek — общие вопросы без ПДн. Если выбранная модель молчит, чат пробует вторую." },
  { kind: "telephony", title: "Телефония", tip: "Novofon тянет записи разговоров в «Базу звонков» и шлёт SMS-ответы консультанта. Webhook входящих: /api/agent/phone. Сюда же можно добавить вторую АТС: имя, ключ, секрет." },
  { kind: "crm", title: "CRM", tip: "AlfaCRM: хост s20.online, почта роли API, ключ v2api. Без этого нет живых групп, записи на пробное и личных дел." },
  { kind: "messenger", title: "Мессенджеры", tip: "ВК Callback API и бот MAX. Один мозг консультанта: развилка «уже ходим / впервые», карточка с диска. Ключи сюда, webhook и последние входящие — Ассистент ИИ → Каналы." },
  { kind: "other", title: "Другие сервисы", tip: "Telegram, почта и любой ключ, который потом подхватит интеграция." },
];

type Row = ApiConn & { hint?: string; note?: string; fields: (ApiConn["fields"][number] & { set?: boolean })[] };

export function AdminIntegrations() {
  const [conns, setConns] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [draft, setDraft] = useState<Record<string, Row>>({});
  const [add, setAdd] = useState({ kind: "other" as ApiKind, name: "", fieldKey: "API_KEY", fieldLabel: "Ключ", fieldValue: "" });

  async function load() {
    const res = await adminApiKeys({ data: { token: token(), action: "list" } });
    if (res.ok && "conns" in res) {
      const list = res.conns as Row[];
      setConns(list);
      const d: Record<string, Row> = {};
      for (const c of list) d[c.id] = { ...c, fields: c.fields.map((f) => ({ ...f })) };
      setDraft(d);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  function take(res: { ok: boolean; conns?: unknown; error?: string }) {
    if (!res.ok) {
      setMsg(res.error || "Ошибка");
      return;
    }
    if (res.conns) {
      const list = res.conns as Row[];
      setConns(list);
      const d: Record<string, Row> = {};
      for (const c of list) d[c.id] = { ...c, fields: c.fields.map((f) => ({ ...f })) };
      setDraft(d);
    }
  }

  async function save(id: string) {
    const conn = draft[id];
    if (!conn) return;
    setBusy(true);
    const res = await adminApiKeys({ data: { token: token(), action: "save", conn } });
    take(res);
    setBusy(false);
    if (res.ok) setMsg(`Сохранено: ${conn.name}`);
  }

  function Card({ c }: { c: Row }) {
    const d = draft[c.id] || c;
    return (
      <article className="flex flex-col rounded-3xl bg-surface p-5 shadow-[var(--shadow-border)]">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="font-display text-lg">{d.name}</p>
            <p className="text-xs text-muted">
              {KIND_RU[c.kind]} · {c.id}
            </p>
          </div>
          <button
            type="button"
            className={cn("rounded-full px-3 py-1 text-xs font-semibold", d.enabled ? "bg-primary text-primary-foreground" : "bg-surface-2")}
            onClick={async () => {
              setBusy(true);
              const res = await adminApiKeys({ data: { token: token(), action: "toggle", id: c.id } });
              take(res);
              setBusy(false);
            }}
          >
            {d.enabled ? "включён" : "выключен"}
          </button>
        </div>
        {c.hint ? <p className="mt-2 text-sm text-muted">{c.hint}</p> : null}
        {c.note ? (
          <p className="mt-3 rounded-2xl bg-surface-2 px-3 py-2.5 text-[0.82rem] leading-relaxed text-fg">{c.note}</p>
        ) : null}
        <div className="mt-4 space-y-3">
          {d.fields.map((f, i) => (
            <label key={f.key} className="block text-sm">
              {f.label}
              {f.set ? <span className="ml-2 text-xs text-muted">задан</span> : null}
              <input
                type={f.secret ? "password" : "text"}
                value={f.value}
                placeholder={f.secret && f.set ? "оставьте •••• чтобы не менять" : ""}
                onChange={(e) =>
                  setDraft((prev) => {
                    const cur = prev[c.id] || c;
                    const fields = cur.fields.map((x, j) => (j === i ? { ...x, value: e.target.value } : x));
                    return { ...prev, [c.id]: { ...cur, fields } };
                  })
                }
                className="mt-1 block h-11 w-full rounded-xl bg-surface-2 px-3 ring-1 ring-black/10"
              />
            </label>
          ))}
        </div>
        <AdminSaveBar>
          {c.id.startsWith("custom-") ? (
            <button
              type="button"
              className="text-xs font-semibold text-primary"
              onClick={async () => {
                setBusy(true);
                const res = await adminApiKeys({ data: { token: token(), action: "remove", id: c.id } });
                take(res);
                setBusy(false);
              }}
            >
              Удалить
            </button>
          ) : null}
          <Button type="button" disabled={busy} onClick={() => void save(c.id)}>
            Сохранить
          </Button>
        </AdminSaveBar>
      </article>
    );
  }

  function KindCol({ kind }: { kind: ApiKind }) {
    const g = GROUPS.find((x) => x.kind === kind);
    const list = conns.filter((c) => c.kind === kind);
    if (!g) return null;
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <h3 className="font-display text-xl">{g.title}</h3>
          <InfoTip text={g.tip} />
        </div>
        {list.length ? (
          <div className={list.length > 1 ? "grid gap-4 md:grid-cols-2" : ""}>
            {list.map((c) => (
              <Card key={c.id} c={c} />
            ))}
          </div>
        ) : (
          <p className="rounded-3xl bg-surface px-5 py-8 text-sm text-muted shadow-[var(--shadow-border)]">Пока пусто</p>
        )}
      </div>
    );
  }

  return (
    <section className="mt-10 space-y-4">
      <AdminSectionHead
        section="apis"
        title="API и интеграции"
        tip="Ключи лежат на сервере в storage/api-keys.json, не в git. Поля с точками — секрет уже есть, впишите новый только если меняете. Пустое поле при сохранении старый ключ не стирает. Процессные переменные .env имеют приоритет, если заданы."
      >
        <p className="mt-2 max-w-2xl text-sm text-muted">Yandex, DeepSeek, Novofon, ВК, MAX, AlfaCRM — ключи здесь. Webhook консультанта: Ассистент ИИ → Каналы.</p>
      </AdminSectionHead>

      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <h3 className="font-display text-xl">Модели ИИ</h3>
          <InfoTip text={GROUPS[0].tip} />
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {conns.filter((c) => c.kind === "llm").map((c) => (
            <Card key={c.id} c={c} />
          ))}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <KindCol kind="telephony" />
        <KindCol kind="crm" />
      </div>

      <KindCol kind="messenger" />

      {conns.some((c) => c.kind === "other") ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <h3 className="font-display text-xl">Другие сервисы</h3>
            <InfoTip text={GROUPS.find((g) => g.kind === "other")?.tip || ""} />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {conns.filter((c) => c.kind === "other").map((c) => (
              <Card key={c.id} c={c} />
            ))}
          </div>
        </div>
      ) : null}

      <article className="flex flex-col rounded-3xl bg-surface p-5 shadow-[var(--shadow-border)] md:p-6">
        <div className="flex items-center gap-2">
          <p className="font-display text-xl">Добавить API</p>
          <InfoTip text="Свой сервис: Telegram, почта, вторая АТС. ВК и MAX уже в каталоге «Мессенджеры». Укажите имя, тип и ключ." />
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          <label className="text-sm">
            Тип
            <select
              value={add.kind}
              onChange={(e) => setAdd({ ...add, kind: e.target.value as ApiKind })}
              className="mt-1 block h-11 w-full rounded-xl bg-surface-2 px-3 ring-1 ring-black/10"
            >
              {(Object.keys(KIND_RU) as ApiKind[]).map((k) => (
                <option key={k} value={k}>
                  {KIND_RU[k]}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            Название
            <input value={add.name} onChange={(e) => setAdd({ ...add, name: e.target.value })} className="mt-1 block h-11 w-full rounded-xl bg-surface-2 px-3 ring-1 ring-black/10" />
          </label>
          <label className="text-sm">
            Имя поля
            <input value={add.fieldKey} onChange={(e) => setAdd({ ...add, fieldKey: e.target.value })} className="mt-1 block h-11 w-full rounded-xl bg-surface-2 px-3 ring-1 ring-black/10" />
          </label>
          <label className="text-sm">
            Значение
            <input value={add.fieldValue} onChange={(e) => setAdd({ ...add, fieldValue: e.target.value })} className="mt-1 block h-11 w-full rounded-xl bg-surface-2 px-3 ring-1 ring-black/10" />
          </label>
        </div>
        <AdminSaveBar>
          <Button
            type="button"
            disabled={busy || !add.name.trim()}
            onClick={async () => {
              setBusy(true);
              const res = await adminApiKeys({
                data: {
                  token: token(),
                  action: "add",
                  kind: add.kind,
                  name: add.name,
                  fieldKey: add.fieldKey,
                  fieldLabel: add.fieldLabel || add.fieldKey,
                  fieldValue: add.fieldValue,
                },
              });
              take(res);
              setBusy(false);
              if (res.ok) {
                setMsg(`Добавлен: ${add.name}`);
                setAdd({ ...add, name: "", fieldValue: "" });
              }
            }}
          >
            Добавить сервис
          </Button>
        </AdminSaveBar>
      </article>
      {msg ? <p className="text-sm text-primary">{msg}</p> : null}
    </section>
  );
}
