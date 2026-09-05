"use client";

import { useEffect, useState } from "react";
import { adminAgentInbox } from "@/data/agent-inbox-fn";
import { Button } from "@/components/ui/button";
import { InfoTip } from "@/components/info-tip";
import { cn } from "@/lib/utils";

function token() {
  if (typeof document === "undefined") return "";
  const m = document.cookie.match(/(?:^|;\s*)ra_admin=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : localStorage.getItem("ra_admin") || "";
}

function when(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

type Status = {
  hooks: { vk: string; max: string; phone: string };
  keys: {
    vk: { token: boolean; secret: boolean; confirmation: boolean; groupId: string };
    max: { token: boolean; secret: boolean };
    phone: { user: boolean; secret: boolean; notify: boolean };
  };
  enabled: { vk: boolean; max: boolean; phone: boolean; site: boolean };
  last: { at: string; channel: string; kind: string; peerId: string; text: string; ok: boolean; error?: string }[];
  threads: { id: string; channel: string; peerId: string; phone: string; turns: number; at: string; preview: string }[];
  subscribed?: string;
  bot?: string;
};

const CARDS: { id: "vk" | "max" | "phone"; title: string; how: string }[] = [
  {
    id: "vk",
    title: "ВКонтакте",
    how: "Сообщество rastudio → Управление → Работа с API → Callback API. Событие «Входящее сообщение». Версия 5.199. Вставьте URL, строку подтверждения и секрет из API и интеграции.",
  },
  {
    id: "max",
    title: "MAX",
    how: "Токен бота из MAX для бизнеса. Нажмите «Подписать webhook» — студия сама отправит URL на platform-api2.max.ru. Секрет — заголовок X-Max-Bot-Api-Secret.",
  },
  {
    id: "phone",
    title: "Novofon",
    how: "АТС → Интеграции → Уведомления о событиях. URL webhook, включите NOTIFY_START и SMS. Проверка ссылки: параметр zd_echo вернётся как есть. Ответ консультанта уходит SMS.",
  },
];

function Dot({ on, label }: { on: boolean; label: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[0.68rem] font-semibold", on ? "bg-primary/10 text-primary" : "bg-surface-2 text-muted")}>
      <span className={cn("h-1.5 w-1.5 rounded-full", on ? "bg-primary" : "bg-black/20")} />
      {label}
    </span>
  );
}

export function AdminAgentChannels() {
  const [data, setData] = useState<Status | null>(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    const res = await adminAgentInbox({ data: { token: token(), action: "list" } });
    if (res.ok && "hooks" in res) setData(res as unknown as Status);
    else setMsg(res.ok ? "" : res.error || "Не удалось загрузить каналы");
  }

  useEffect(() => {
    void load();
    const id = window.setInterval(() => void load(), 12000);
    return () => window.clearInterval(id);
  }, []);

  async function act(action: "subscribeMax" | "probeMax") {
    setBusy(true);
    const res = await adminAgentInbox({ data: { token: token(), action } });
    setBusy(false);
    if (res.ok && "hooks" in res) {
      setData(res as unknown as Status);
      setMsg(action === "subscribeMax" ? "Webhook MAX подписан." : "Бот MAX отвечает.");
    } else setMsg(res.ok ? "" : res.error || "Ошибка");
  }

  function copy(text: string) {
    void navigator.clipboard?.writeText(text).then(
      () => setMsg("Адрес скопирован"),
      () => setMsg(text),
    );
  }

  const hooks = data?.hooks;
  const keys = data?.keys;
  const enabled = data?.enabled;

  return (
    <div className="space-y-5">
      <div>
        <h3 className="font-display text-2xl">Живые каналы консультанта</h3>
        <p className="mt-2 max-w-3xl text-sm text-muted">
          Один мозг: Олег и Ольга. Сайт, личка ВК, бот MAX и SMS Novofon пишут в одну ленту на диске. Alfa — разъём, чат в CRM не выгружаем.
          Ключи — вкладка «API и интеграции». Правила речи — «Обучение агентов».
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {CARDS.map((c) => {
          const url = hooks?.[c.id] || `https://www.rastudio.org/api/agent/${c.id}`;
          const on = Boolean(enabled?.[c.id]);
          return (
            <article key={c.id} className="flex flex-col rounded-3xl bg-surface p-5 shadow-[var(--shadow-border)]">
              <div className="flex items-start justify-between gap-2">
                <p className="font-display text-xl">{c.title}</p>
                <Dot on={on} label={on ? "ключ есть" : "нет ключа"} />
              </div>
              <p className="mt-2 text-sm leading-relaxed text-muted">{c.how}</p>
              <label className="mt-4 block text-xs font-semibold text-muted">
                Webhook
                <span className="mt-1 flex gap-2">
                  <input readOnly value={url} className="h-10 flex-1 rounded-xl bg-surface-2 px-3 text-sm text-fg ring-1 ring-black/10" />
                  <button type="button" className="h-10 rounded-xl bg-black/[0.07] px-3 text-xs font-semibold" onClick={() => copy(url)}>
                    Копировать
                  </button>
                </span>
              </label>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {c.id === "vk" ? (
                  <>
                    <Dot on={Boolean(keys?.vk.token)} label="токен" />
                    <Dot on={Boolean(keys?.vk.secret)} label="secret" />
                    <Dot on={Boolean(keys?.vk.confirmation)} label="confirmation" />
                  </>
                ) : null}
                {c.id === "max" ? (
                  <>
                    <Dot on={Boolean(keys?.max.token)} label="токен" />
                    <Dot on={Boolean(keys?.max.secret)} label="secret" />
                  </>
                ) : null}
                {c.id === "phone" ? (
                  <>
                    <Dot on={Boolean(keys?.phone.user)} label="user key" />
                    <Dot on={Boolean(keys?.phone.secret)} label="secret" />
                    <Dot on={Boolean(keys?.phone.notify)} label="notify" />
                  </>
                ) : null}
              </div>
              {c.id === "max" ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button type="button" disabled={busy} onClick={() => void act("subscribeMax")}>
                    Подписать webhook
                  </Button>
                  <Button type="button" variant="secondary" disabled={busy} onClick={() => void act("probeMax")}>
                    Проверить бота
                  </Button>
                </div>
              ) : null}
            </article>
          );
        })}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <article className="rounded-3xl bg-surface p-5 shadow-[var(--shadow-border)]">
          <div className="flex items-center gap-2">
            <h3 className="font-display text-xl">Последние входящие</h3>
            <InfoTip text="События webhook: ВК, MAX, Novofon. Не Alfa. Ошибки секрета и отправки SMS тоже сюда." />
          </div>
          <ul className="mt-3 space-y-2 text-sm">
            {(data?.last || []).length ? (
              (data?.last || []).map((e, i) => (
                <li key={`${e.at}-${i}`} className="rounded-2xl bg-surface-2 px-3 py-2">
                  <p className="flex flex-wrap items-center gap-2 text-xs text-muted">
                    <span className="font-semibold uppercase text-fg">{e.channel}</span>
                    <span>{e.kind}</span>
                    <span>{when(e.at)}</span>
                    <span className={e.ok ? "text-primary" : "text-red-600"}>{e.ok ? "ok" : e.error || "ошибка"}</span>
                  </p>
                  {e.text ? <p className="mt-1">{e.text}</p> : null}
                </li>
              ))
            ) : (
              <li className="text-sm text-muted">Пока пусто. Напишите боту или позвоните — строка появится здесь.</li>
            )}
          </ul>
        </article>
        <article className="rounded-3xl bg-surface p-5 shadow-[var(--shadow-border)]">
          <div className="flex items-center gap-2">
            <h3 className="font-display text-xl">Живые треды</h3>
            <InfoTip text="Последние 12 диалогов каналов. Полная лента сайта — вкладка «Диалоги сайта»." />
          </div>
          <ul className="mt-3 space-y-2 text-sm">
            {(data?.threads || []).length ? (
              (data?.threads || []).map((t) => (
                <li key={t.id} className="rounded-2xl bg-surface-2 px-3 py-2">
                  <p className="flex flex-wrap items-center gap-2 text-xs text-muted">
                    <span className="font-semibold uppercase text-fg">{t.channel}</span>
                    <span>{t.turns} реплик</span>
                    <span>{when(t.at)}</span>
                    {t.phone ? <span>{t.phone}</span> : null}
                  </p>
                  {t.preview ? <p className="mt-1">{t.preview}</p> : null}
                </li>
              ))
            ) : (
              <li className="text-sm text-muted">Тредов ещё нет.</li>
            )}
          </ul>
        </article>
      </div>
      {msg ? <p className="text-sm text-primary">{msg}</p> : null}
    </div>
  );
}
