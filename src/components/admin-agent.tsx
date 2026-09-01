"use client";

import { useEffect, useState } from "react";
import { adminAgentBrain, type AgentSettings } from "@/data/agent-config";
import { Button } from "@/components/ui/button";
import { AdminChats } from "@/components/admin-chats";
import { AdminVoices } from "@/components/admin-voices";
import { AdminVoiceEdits } from "@/components/admin-voice-edits";
import { AdminTrain } from "@/components/admin-train";
import { AdminDebug } from "@/components/admin-debug";
import { InfoTip } from "@/components/info-tip";
import { cn } from "@/lib/utils";

function token() {
  if (typeof document === "undefined") return "";
  const m = document.cookie.match(/(?:^|;\s*)ra_admin=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : localStorage.getItem("ra_admin") || "";
}

type Pane = "window" | "dialog" | "voices" | "edits" | "chats" | "train" | "access" | "debug";

const PANES: { id: Pane; label: string }[] = [
  { id: "window", label: "Окно и кнопки" },
  { id: "dialog", label: "Как говорит" },
  { id: "voices", label: "Голоса" },
  { id: "edits", label: "Изменение сайта" },
  { id: "chats", label: "Диалоги сайта" },
  { id: "train", label: "Обучение" },
  { id: "access", label: "Голосовой доступ" },
  { id: "debug", label: "Отладка" },
];

function Toggle({
  on,
  title,
  hint,
  tip,
  set,
}: {
  on: boolean;
  title: string;
  hint: string;
  tip: string;
  set: (v: boolean) => void;
}) {
  return (
    <label className="flex items-start gap-3 rounded-3xl bg-surface p-5 text-sm shadow-[var(--shadow-border)]">
      <input type="checkbox" checked={on} onChange={(e) => set(e.target.checked)} className="mt-1" />
      <span className="min-w-0">
        <span className="flex items-center gap-2 font-semibold">
          {title}
          <InfoTip text={tip} />
        </span>
        <span className="mt-1 block text-muted">{hint}</span>
        <span className={cn("mt-2 inline-block rounded-full px-2 py-0.5 text-[0.68rem] font-semibold", on ? "bg-primary/10 text-primary" : "bg-surface-2 text-muted")}>
          {on ? "включено" : "выключено"}
        </span>
      </span>
    </label>
  );
}

export function AdminAgent() {
  const [settings, setSettings] = useState<AgentSettings | null>(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [pane, setPane] = useState<Pane>("window");

  async function load() {
    const res = await adminAgentBrain({ data: { token: token(), action: "get" } });
    if (res.ok && "settings" in res) setSettings(res.settings);
  }

  useEffect(() => {
    void load();
  }, []);

  async function save() {
    if (!settings) return;
    setBusy(true);
    const res = await adminAgentBrain({ data: { token: token(), action: "saveSettings", settings } });
    setBusy(false);
    setMsg(res.ok ? "Сохранено — на сайте сразу, после обновления страницы." : res.error || "Ошибка");
  }

  if (!settings) return <p className="mt-10 text-sm text-muted">Загрузка настроек…</p>;

  return (
    <section className="mt-10 space-y-6">
      <div>
        <h2 className="font-display text-3xl">Ассистент ИИ</h2>
        <p className="mt-2 max-w-2xl text-sm text-muted">
          Окно чата, обучение, голоса, доступ и история диалогов — всё здесь.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {PANES.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setPane(p.id)}
            className={cn("rounded-full px-4 py-2 text-sm font-semibold", pane === p.id ? "bg-primary text-primary-foreground" : "bg-surface")}
          >
            {p.label}
          </button>
        ))}
      </div>

      {pane === "window" ? (
        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2">
            <Toggle
              on={settings.showChat}
              set={(v) => setSettings({ ...settings, showChat: v })}
              title="Окно ИИ-агента на сайте"
              hint="Кнопка «Подобрать курс» и само окно чата. Выключите — посетитель агента не увидит."
              tip="Полностью прячет виджет на всех страницах. Диалоги и обучение в кабинете остаются. Чтобы вернуть — включите снова и сохраните."
            />
            <Toggle
              on={settings.allowVoice}
              set={(v) => setSettings({ ...settings, allowVoice: v })}
              title="Голосовой режим"
              hint="Кнопка «Включить голосовой режим» и микрофон ввода."
              tip="Выключено — только текст. Уже открытый голосовой сеанс на сайте закроется после обновления страницы."
            />
            <Toggle
              on={settings.allowAdminMode}
              set={(v) => setSettings({ ...settings, allowAdminMode: v })}
              title="Административный режим из чата"
              hint="Ссылка «войти в административный режим» внизу окна."
              tip="Выключите, если правки сайта только из этого кабинета. Кодовое слово в чате тогда не предлагается."
            />
            <Toggle
              on={settings.showChips}
              set={(v) => setSettings({ ...settings, showChips: v })}
              title="Кнопки-подсказки под сообщениями"
              hint="Возраст, город, филиал, курсы и прочие чипы."
              tip="Текст вводить можно. Без кнопок воронка идёт голосовыми/текстовыми ответами. Обычно оставляют включённым."
            />
            <Toggle
              on={settings.allowOlga}
              set={(v) => setSettings({ ...settings, allowOlga: v })}
              title="Говорить с Ольгой"
              hint="Кнопка выбора Ольги в шапке чата."
              tip="Если Ольгу выключить, а Олега оставить — чат сразу с Олегом. Если обоих выключить, кнопок выбора не будет, говорит тот, кто «встречает»."
            />
            <Toggle
              on={settings.allowOleg}
              set={(v) => setSettings({ ...settings, allowOleg: v })}
              title="Говорить с Олегом"
              hint="Кнопка выбора Олега в шапке чата."
              tip="Олег — техника. Если его нет, творческие и технические вопросы ведёт Ольга."
            />
            <Toggle
              on={settings.allowReset}
              set={(v) => setSettings({ ...settings, allowReset: v })}
              title="Сброс и обновление диалога"
              hint="Круглая кнопка сброса в шапке окна."
              tip="Без неё история сессии не сбрасывается с сайта. Новый посетитель всё равно начинает с чистого чата."
            />
            <Toggle
              on={settings.allowBarge !== false}
              set={(v) => setSettings({ ...settings, allowBarge: v })}
              title="Перебивание в голосовом режиме"
              hint="В окне чата появляется кнопка «Можно перебивать»."
              tip="Посетитель сам включает. Пока говорит ассистент — можно сказать поверх, и ответ сразу пойдёт в чат. По умолчанию у клиента выключено, чтобы не ловить эхо."
            />
            <Toggle
              on={settings.matchChipsToMessage !== false}
              set={(v) => setSettings({ ...settings, matchChipsToMessage: v })}
              title="Кнопки только под текст"
              hint="Подсказки совпадают с последней фразой. Не показываем возраст, если спросили город."
              tip="Выключите — кнопки снова по воронке, даже если в сообщении другой вопрос. Обычно оставляют включённым."
            />
            <Toggle
              on={settings.keepAssistantReplies !== false}
              set={(v) => setSettings({ ...settings, keepAssistantReplies: v })}
              title="Не удалять ответы ассистента"
              hint="Каждая реплика Олега и Ольги остаётся в ленте."
              tip="Раньше похожий вопрос глотался и казалось, что ответ стёрли. Выключите только если лента дублируется."
            />
            <Toggle
              on={settings.speakEveryReply !== false}
              set={(v) => setSettings({ ...settings, speakEveryReply: v })}
              title="Озвучивать каждый вопрос"
              hint="Голосовой режим читает всю фразу, включая вопрос в конце."
              tip="Если Yandex SpeechKit не ответил — фраза всё равно прозвучит запасным голосом. Первое приветствие тоже озвучивается."
            />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" disabled={busy} onClick={() => void save()}>
              Сохранить
            </Button>
            {msg ? <p className="text-sm text-primary">{msg}</p> : null}
          </div>
        </div>
      ) : null}

      {pane === "dialog" ? (
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="rounded-3xl bg-surface p-5 text-sm shadow-[var(--shadow-border)]">
              Кто встречает родителя
              <select
                value={settings.defaultPartner}
                onChange={(e) => setSettings({ ...settings, defaultPartner: e.target.value === "oleg" ? "oleg" : "olga" })}
                className="mt-2 block h-11 w-full rounded-xl bg-surface-2 px-3 ring-1 ring-black/10"
              >
                <option value="olga">Ольга</option>
                <option value="oleg">Олег</option>
              </select>
            </label>
            <label className="rounded-3xl bg-surface p-5 text-sm shadow-[var(--shadow-border)]">
              Стиль ответов
              <select
                value={settings.style}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    style: e.target.value === "short" || e.target.value === "detailed" ? e.target.value : "warm",
                  })
                }
                className="mt-2 block h-11 w-full rounded-xl bg-surface-2 px-3 ring-1 ring-black/10"
              >
                <option value="warm">Тёплый, живой</option>
                <option value="short">Короткий</option>
                <option value="detailed">Подробнее</option>
              </select>
            </label>
          </div>
          <div className="rounded-3xl bg-surface p-5 shadow-[var(--shadow-border)] md:p-6">
            <label className="flex items-start gap-3 text-sm">
              <input type="checkbox" checked={settings.askOnce} onChange={(e) => setSettings({ ...settings, askOnce: e.target.checked })} className="mt-1" />
              <span>
                <strong>Не повторять вопросы.</strong> Если возраст, город, филиал, курс, имя или телефон уже названы — не спрашивать снова.
              </span>
            </label>
            <label className="mt-4 flex items-start gap-3 text-sm">
              <input type="checkbox" checked={settings.injectTraining} onChange={(e) => setSettings({ ...settings, injectTraining: e.target.checked })} className="mt-1" />
              <span>Подмешивать примеры из раздела «Обучение» в каждый ответ ассистента.</span>
            </label>
            <label className="mt-4 block text-sm">
              Сколько примеров обучения держать в голове
              <input
                type="number"
                min={4}
                max={80}
                value={settings.maxExamples}
                onChange={(e) => setSettings({ ...settings, maxExamples: Number(e.target.value) || 40 })}
                className="mt-2 h-11 w-32 rounded-xl bg-surface-2 px-3 ring-1 ring-black/10"
              />
            </label>
          </div>
          <label className="block rounded-3xl bg-surface p-5 text-sm shadow-[var(--shadow-border)] md:p-6">
            Дополнительная инструкция (всегда в промпте)
            <textarea
              value={settings.extra}
              onChange={(e) => setSettings({ ...settings, extra: e.target.value })}
              rows={6}
              placeholder="Например: не предлагай летние программы с сентября; на Гражданской нет беспилотников."
              className="mt-2 w-full rounded-xl bg-surface-2 px-3 py-2.5 ring-1 ring-black/10"
            />
          </label>
          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" disabled={busy} onClick={() => void save()}>
              Сохранить настройки
            </Button>
            {msg ? <p className="text-sm text-primary">{msg}</p> : null}
          </div>
        </div>
      ) : null}

      {pane === "voices" ? <AdminVoices /> : null}
      {pane === "edits" ? <AdminVoiceEdits /> : null}
      {pane === "chats" ? <AdminChats /> : null}
      {pane === "train" ? <AdminTrain /> : null}
      {pane === "access" ? <AdminAccess /> : null}
      {pane === "debug" ? <AdminDebug /> : null}
    </section>
  );
}
