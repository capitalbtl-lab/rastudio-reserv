"use client";

import { useEffect, useState } from "react";
import {
  adminAgentDocs,
  type Contradiction,
  type DocKind,
  type TransformRow,
} from "@/data/agent-docs";
import type { AgentChannel } from "@/data/agent-channels";
import { Button } from "@/components/ui/button";
import { InfoTip } from "@/components/info-tip";
import { cn } from "@/lib/utils";

function token() {
  if (typeof document === "undefined") return "";
  const m = document.cookie.match(/(?:^|;\s*)ra_admin=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : localStorage.getItem("ra_admin") || "";
}

type DocRow = {
  id: string;
  at: string;
  kind: DocKind;
  name: string;
  chars: number;
  text?: string;
  items: { id: string; title: string; body: string; on: boolean; channel?: string }[];
  byChannel?: Record<string, string>;
  transformRows?: TransformRow[];
  transformAt?: string;
  transformAccuracy?: number;
  transformDrift?: number;
  active: boolean;
  status: "ok" | "empty" | "error";
  error?: string;
};

const ZONES: { kind: DocKind; title: string; accept: string; tip: string; help: string }[] = [
  {
    kind: "instruction",
    title: "Инструкция для агента",
    accept: ".pdf,.doc,.docx,.txt,.md,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    tip: "Методичка: как говорить, чего не делать, источники фактов. После загрузки нажмите «Преобразовать» — система разложит текст по каналам (сайт, телефон, ВК, MAX, общее), не сокращая формулировки. Пока преобразование не подтверждено, на сайте агент читает документ целиком.",
    help: "PDF или Word с текстовым слоем. Затем «Преобразовать» → проверьте таблицу → «Применить».",
  },
  {
    kind: "rules",
    title: "Правила оказания услуг",
    accept: ".pdf,.doc,.docx,.txt,.md,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    tip: "Официальные правила: абонемент, пропуск, перевод, возврат. Агент отвечает из этого файла, а не «по-человечески в обход». После преобразования телефонный агент не тащит правила про кнопки сайта, и наоборот.",
    help: "Действующая редакция. Скан без текста система не прочитает.",
  },
  {
    kind: "offer",
    title: "Договор оферты",
    accept: ".pdf,.doc,.docx,.txt,.md,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    tip: "Публичная оферта. Агент коротко объясняет пункт родителю. Не читает договор вслух целиком, но в промпте хранится полный текст выбранного канала.",
    help: "Текстовый PDF или Word.",
  },
  {
    kind: "other",
    title: "Прочие документы",
    accept: ".pdf,.doc,.docx,.txt,.md,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    tip: "Памятки, регламент лета, согласие на фото — всё, что может понадобиться в разговоре. Каналы те же: 4–6 штук, настраиваются выше.",
    help: "Любой рабочий документ до 8 МБ.",
  },
];

const KIND_RU: Record<DocKind, string> = {
  instruction: "Инструкция",
  rules: "Правила",
  offer: "Оферта",
  other: "Прочее",
};

const CHANNEL_HINT: Record<string, string> = {
  site: "Живой канал прямо сейчас. Чат rastudio.org шлёт id=site. Сюда — кнопки возраста, кнопка курса, голос на сайте. Не пишите «продиктуйте адрес» — это для телефона.",
  phone: "Novofon: входящие и исходящие. Кнопок нет, один вопрос за реплику. Сюда — как называть филиалы вслух и что нельзя собирать по звонку.",
  vk: "Личка сообщества. Комментарий под постом — не место для ФИО и телефона: сначала в сообщения. Ссылки можно, голосовые кружки — нет.",
  max: "Бот MAX. Голосовые вложения просим текстом или звонком на 8 800. Ссылки пишем целиком.",
  common: "Этот столбец читает каждый канал. Правила студии, запреты, адреса, учебный год. Не кладите сюда «нажмите кнопку».",
  telegram: "Запасной канал. Появится в промпте, когда бот начнёт передавать channel=telegram.",
};

function guessId(text: string, ids: string[]) {
  const t = text.toLowerCase();
  if (ids.includes("vk") && /вконтакте|\bвк\b|vk\.com|сообществ|комментари/.test(t)) return "vk";
  if (ids.includes("max") && /\bmax\b|мессенджер макс|в макс/.test(t)) return "max";
  if (ids.includes("phone") && /телефон|звонк|входящ|исходящ|прозвон|sip|набрать/.test(t)) return "phone";
  if (ids.includes("site") && /на сайте|чат сайта|кнопк|rastudio|браузер|голосов/.test(t)) return "site";
  return ids.includes("common") ? "common" : ids[0] || "common";
}

function columnsOf(d: DocRow, list: AgentChannel[]) {
  if (d.byChannel && Object.values(d.byChannel).some(Boolean)) return d.byChannel;
  const bag: Record<string, string[]> = {};
  for (const c of list) bag[c.id] = [];
  const chunks = d.items.length
    ? d.items.filter((it) => it.on).map((it) => [it.title, it.body].filter(Boolean).join("\n"))
    : d.text
      ? [d.text]
      : [];
  const ids = list.map((c) => c.id);
  for (const chunk of chunks) {
    const id = itChannel(d, chunk, ids);
    (bag[id] ||= []).push(chunk);
  }
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(bag)) out[k] = v.join("\n\n");
  return out;
}

function itChannel(d: DocRow, chunk: string, ids: string[]) {
  const hit = d.items.find((it) => chunk.startsWith(it.title));
  if (hit?.channel && ids.includes(hit.channel)) return hit.channel;
  return guessId(chunk, ids);
}

const STEPS = [
  { n: "1", t: "Каналы", d: "4–6 сред. Сейчас живой только сайт." },
  { n: "2", t: "Файл", d: "Word или PDF. Текст целиком, без сжатия." },
  { n: "3", t: "Преобразовать", d: "Таблица: было → канал → станет + %." },
  { n: "4", t: "Применить", d: "Пять столбцов. Агент читает свой и общее." },
  { n: "5", t: "Противоречия", d: "Сверка скриптов и документов." },
];

function toB64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const s = String(r.result || "");
      resolve(s.includes(",") ? s.slice(s.indexOf(",") + 1) : s);
    };
    r.onerror = () => reject(new Error("read"));
    r.readAsDataURL(file);
  });
}

export function AdminTrainDocs() {
  const [docs, setDocs] = useState<DocRow[]>([]);
  const [channels, setChannels] = useState<AgentChannel[]>([]);
  const [contradictions, setContradictions] = useState<Contradiction[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [open, setOpen] = useState("");
  const [previewOf, setPreviewOf] = useState("");
  const [draftRows, setDraftRows] = useState<Record<string, TransformRow[]>>({});
  const [newCh, setNewCh] = useState({ id: "telegram", label: "Агент в Telegram" });
  const [percent, setPercent] = useState(0);

  async function load() {
    const res = await adminAgentDocs({ data: { token: token(), action: "list" } });
    if (res.ok && "docs" in res) {
      setDocs(res.docs as DocRow[]);
      if ("channels" in res && res.channels) setChannels(res.channels as AgentChannel[]);
      if ("contradictions" in res && res.contradictions) setContradictions(res.contradictions as Contradiction[]);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  function take(res: { ok: boolean; docs?: unknown; channels?: unknown; contradictions?: unknown; error?: string }) {
    if (!res.ok) {
      setMsg(res.error || "Ошибка");
      return;
    }
    if (res.docs) setDocs(res.docs as DocRow[]);
    if (res.channels) setChannels(res.channels as AgentChannel[]);
    if (res.contradictions) setContradictions(res.contradictions as Contradiction[]);
  }

  async function upload(kind: DocKind, file: File) {
    setBusy(true);
    setMsg("Читаю файл… текст не сокращаем.");
    try {
      const base64 = await toB64(file);
      const res = await adminAgentDocs({
        data: { token: token(), action: "upload", kind, name: file.name, mime: file.type, base64 },
      });
      take(res);
      if (res.ok) setMsg(`Файл «${file.name}» принят. Нажмите «Преобразовать», чтобы разложить по каналам.`);
    } catch {
      setMsg("Не удалось прочитать файл в браузере.");
    }
    setBusy(false);
  }

  async function run(action: "remove" | "toggle" | "reparse", id: string, extra?: { on?: boolean }) {
    setBusy(true);
    const res = await adminAgentDocs({ data: { token: token(), action, id, on: extra?.on } });
    take(res);
    setBusy(false);
  }

  async function saveChannels() {
    setBusy(true);
    const res = await adminAgentDocs({ data: { token: token(), action: "saveChannels", channels } });
    take(res);
    setBusy(false);
    if (res.ok) setMsg("Каналы сохранены. Агент на сайте сейчас работает как «Агент на сайте».");
  }

  async function preview(id: string) {
    setBusy(true);
    setMsg("Раскладываю оригинал по каналам, без сжатия…");
    const res = await adminAgentDocs({ data: { token: token(), action: "previewTransform", id, percent } });
    take(res);
    setBusy(false);
    if (res.ok && "docs" in res) {
      const doc = (res.docs as DocRow[]).find((d) => d.id === id);
      setDraftRows((p) => ({ ...p, [id]: doc?.transformRows || [] }));
      setPreviewOf(id);
      setOpen(id);
      setMsg(
        doc
          ? `Превью готово. Точность ${doc.transformAccuracy ?? "—"}%, расхождение ${doc.transformDrift ?? "—"}% (цель адаптации ${percent}%). Проверьте строки и нажмите «Применить преобразование».`
          : "Превью готово.",
      );
    }
  }

  async function apply(id: string) {
    setBusy(true);
    const res = await adminAgentDocs({
      data: { token: token(), action: "applyTransform", id, rows: draftRows[id] || [] },
    });
    take(res);
    setBusy(false);
    if (res.ok) {
      setPreviewOf("");
      setMsg("Преобразование записано. На сайте агент читает только «Общее» и «Агент на сайте».");
    }
  }

  async function findConflicts() {
    setBusy(true);
    setMsg("Читаю скрипты, документы и правила…");
    const res = await adminAgentDocs({ data: { token: token(), action: "contradictions" } });
    take(res);
    setBusy(false);
    if (res.ok) {
      const n = (res.contradictions as Contradiction[] | undefined)?.length || 0;
      setMsg(n ? `Нашли ${n} противоречий. Автоисправления можно применить пачкой, спорные — правите вручную.` : "Противоречий не видно.");
    }
  }

  async function applyFixes() {
    const ids = contradictions.filter((c) => c.status === "open" && c.autoFix && !c.needManual).map((c) => c.id);
    if (!ids.length) {
      setMsg("Автоисправлений нет — только ручные.");
      return;
    }
    setBusy(true);
    const res = await adminAgentDocs({ data: { token: token(), action: "applyFixes", fixIds: ids } });
    take(res);
    setBusy(false);
    if (res.ok) setMsg(`В обучение записано ${ids.length} правил. Ручные пункты остались открытыми.`);
  }

  function patchRow(docId: string, rowId: string, patch: Partial<TransformRow>) {
    setDraftRows((prev) => {
      const list = (prev[docId] || []).map((r) => (r.id === rowId ? { ...r, ...patch } : r));
      return { ...prev, [docId]: list };
    });
  }

  return (
    <div className="space-y-6">
      <article className="rounded-3xl bg-surface p-5 shadow-[var(--shadow-border)] md:p-6">
        <div className="flex items-start gap-2">
          <h3 className="font-display text-2xl">Как устроены документы и каналы</h3>
          <InfoTip text="Канал — среда, где сейчас говорит агент. Чат rastudio.org = сайт. Novofon = телефон. Сообщество = ВК. Бот MAX = MAX. «Общее» читают всегда. Чужой столбец агент не видит: телефон не рассказывает про кнопки чата." />
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          {STEPS.map((s) => (
            <div key={s.n} className="rounded-2xl bg-surface-2 p-3">
              <p className="text-[0.7rem] font-semibold uppercase tracking-wider text-primary">{s.n}. {s.t}</p>
              <p className="mt-1 text-sm leading-snug">{s.d}</p>
            </div>
          ))}
        </div>
      </article>

      <article className="overflow-hidden rounded-[1.75rem] bg-surface shadow-[var(--shadow-border)]">
        <div className="border-b border-black/6 px-5 py-5 md:px-6">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-display text-xl">Каналы коммуникации</h3>
            <InfoTip text="Каждая карточка — отдельный агент. Поле «Правила канала» попадает в преобразование: при проценте выше 0 текст инструкции переписывается под эти правила (кнопки на сайте, один вопрос на телефоне, личка в ВК). Чат rastudio.org всегда id=site. Не удаляйте «Общее» — его читают все. После правок нажмите «Сохранить каналы», иначе преобразование возьмёт старые правила." />
          </div>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted">
            Сейчас на сайте говорит <span className="font-semibold text-fg">Агент на сайте</span>. Остальные каналы хранят свой столбец, пока не подключится телефон, ВК или MAX.
          </p>
        </div>
        <div className="grid gap-0 lg:grid-cols-5">
          {channels.map((c, i) => (
            <div
              key={c.id}
              className={cn(
                "flex flex-col border-black/6 p-4 lg:border-r lg:last:border-r-0",
                i > 0 ? "border-t lg:border-t-0" : "",
                c.id === "site" ? "bg-[#f4f7ff]" : "bg-white",
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-muted">{c.id}</p>
                  {c.id === "site" ? (
                    <span className="mt-1 inline-flex rounded-full bg-primary px-2 py-0.5 text-[0.65rem] font-semibold text-white">сейчас на сайте</span>
                  ) : null}
                </div>
                <InfoTip text={CHANNEL_HINT[c.id] || "Дополнительный канал. Правила внизу карточки — как говорить в этой среде."} />
              </div>
              <label className="mt-3 text-xs font-semibold text-muted">
                Название
                <input
                  value={c.label}
                  onChange={(e) => setChannels((list) => list.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))}
                  className="mt-1 h-10 w-full rounded-xl bg-surface-2 px-3 text-sm font-medium text-fg ring-1 ring-black/8"
                />
              </label>
              <label className="mt-3 flex-1 text-xs font-semibold text-muted">
                <span className="inline-flex items-center gap-1">
                  Правила канала
                  <InfoTip text="Этот текст видит модель, когда процент адаптации больше 0. Пишите манеру канала: длина реплики, кнопки или без, что запрещено. Не дублируйте оферту." />
                </span>
                <textarea
                  value={c.rules || ""}
                  onChange={(e) => setChannels((list) => list.map((x, j) => (j === i ? { ...x, rules: e.target.value } : x)))}
                  rows={8}
                  className="mt-1 w-full resize-y rounded-xl bg-surface-2 px-3 py-2 text-[0.8rem] leading-relaxed text-fg ring-1 ring-black/8"
                />
              </label>
              {c.locked ? null : (
                <button type="button" className="mt-2 self-start text-xs font-semibold text-primary" onClick={() => setChannels((list) => list.filter((_, j) => j !== i))}>
                  Убрать канал
                </button>
              )}
            </div>
          ))}
        </div>
        <div className="flex flex-wrap items-end gap-3 border-t border-black/6 px-5 py-4 md:px-6">
          {channels.length < 6 ? (
            <>
              <label className="text-sm">
                <span className="inline-flex items-center gap-1">
                  id
                  <InfoTip text="Латиница без пробелов: telegram, alice. Это значение придёт в чат как channel." />
                </span>
                <input value={newCh.id} onChange={(e) => setNewCh({ ...newCh, id: e.target.value })} className="mt-1 block h-11 w-36 rounded-xl bg-surface-2 px-3 ring-1 ring-black/10" />
              </label>
              <label className="text-sm">
                Название
                <input value={newCh.label} onChange={(e) => setNewCh({ ...newCh, label: e.target.value })} className="mt-1 block h-11 w-52 rounded-xl bg-surface-2 px-3 ring-1 ring-black/10" />
              </label>
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  if (!newCh.id.trim() || channels.some((c) => c.id === newCh.id)) return;
                  setChannels((list) => [...list, { id: newCh.id.trim(), label: newCh.label.trim() || newCh.id, locked: false, rules: "" }]);
                }}
              >
                Добавить канал
              </Button>
            </>
          ) : null}
          <Button type="button" disabled={busy} onClick={() => void saveChannels()}>
            Сохранить каналы
          </Button>
          <InfoTip text="Пишет названия и правила в storage/agent-channels.json. Без этой кнопки «Преобразовать» читает предыдущую сохранённую версию правил." />
        </div>
      </article>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" disabled={busy} onClick={() => void findConflicts()}>
          Уточнить противоречия
        </Button>
        <InfoTip text="Читает скрипты воронки, доп. инструкцию, правила из примеров и все включённые документы. Ищет, где одно место разрешает то, что другое запрещает (цены, возврат, запись, филиалы). Не меняет файлы само. Результат — список: автоматически (станет правилом в обучении) или вручную." />
        <Button type="button" variant="secondary" disabled={busy || !contradictions.some((c) => c.autoFix && !c.needManual && c.status === "open")} onClick={() => void applyFixes()}>
          Применить автоисправления
        </Button>
        <InfoTip text="Берёт только пункты с готовым autoFix и без пометки «нужно вручную». Записывает их как правила в «Примеры». Документы Word не переписывает — это сделаете вы, если примете формулировку." />
      </div>

      {contradictions.length ? (
        <div className="space-y-3">
          {contradictions.map((c) => (
            <article key={c.id} className={cn("rounded-3xl p-5 shadow-[var(--shadow-border)]", c.status === "applied" ? "bg-surface-2" : "bg-surface")}>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted">
                {c.severity === "high" ? "Сильное" : c.severity === "low" ? "Слабое" : "Среднее"} · {c.needManual ? "вручную" : "можно автоматически"} · {c.status}
              </p>
              <p className="mt-2 text-sm">«{c.a}»</p>
              <p className="mt-1 text-sm text-muted">против «{c.b}»</p>
              <p className="mt-2 text-sm">{c.proposal}</p>
              {c.autoFix ? <pre className="mt-2 whitespace-pre-wrap rounded-xl bg-surface-2 p-3 text-xs">{c.autoFix}</pre> : null}
              <p className="mt-2 text-xs text-muted">{c.sources.join(" · ")}</p>
            </article>
          ))}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        {ZONES.map((z) => (
          <article key={z.kind} className="rounded-3xl bg-surface p-5 shadow-[var(--shadow-border)]">
            <div className="flex items-center gap-2">
              <p className="font-display text-xl">{z.title}</p>
              <InfoTip text={z.tip} />
            </div>
            <p className="mt-2 text-sm text-muted">{z.help}</p>
            <label className={cn("mt-4 inline-flex h-11 cursor-pointer items-center rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground", busy && "opacity-60")}>
              Загрузить
              <input
                type="file"
                accept={z.accept}
                className="hidden"
                disabled={busy}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void upload(z.kind, f);
                  e.target.value = "";
                }}
              />
            </label>
            <InfoTip className="ml-2" text="Файл уходит на сервер, текст извлекается скриптом (PDF/Word), оригинал лежит в storage/agent-docs. 8 МБ максимум." />
          </article>
        ))}
      </div>

      {msg ? <p className="text-sm text-primary">{msg}</p> : null}

      <div className="space-y-4">
        {docs.map((d) => {
          const rows = draftRows[d.id] || d.transformRows || [];
          const showPreview = previewOf === d.id && rows.length;
          return (
            <article key={d.id} className="rounded-3xl bg-surface p-5 shadow-[var(--shadow-border)]">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-display text-lg">{d.name}</p>
                    <InfoTip text={`${KIND_RU[d.kind]}. ${d.chars} знаков оригинала. ${d.byChannel ? "Разложен по каналам." : "Ещё не преобразован — агент на сайте читает весь текст."} Точность последнего преобразования: ${d.transformAccuracy ?? "—"}%, расхождение ${d.transformDrift ?? "—"}%.`} />
                  </div>
                  <p className="mt-1 text-xs text-muted">
                    {KIND_RU[d.kind]} · {d.chars} зн. · {d.byChannel ? "каналы записаны" : "не преобразован"}
                    {d.transformAccuracy != null ? ` · точность ${d.transformAccuracy}% · расхождение ${d.transformDrift}%` : ""}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    className={cn("rounded-full px-3 py-1.5 text-xs font-semibold", d.active ? "bg-primary text-primary-foreground" : "bg-surface-2")}
                    onClick={() => void run("toggle", d.id, { on: !d.active })}
                  >
                    {d.active ? "В ответах" : "Выключен"}
                  </button>
                  <InfoTip text="Выключенный документ не попадает ни в один канал. Файл остаётся в кабинете." />
                  <label className="flex items-center gap-2 rounded-full bg-surface-2 px-3 py-1.5 text-xs font-semibold">
                    <span className="inline-flex items-center gap-1">
                      %
                      <InfoTip text="0% — разложить по каналам дословно, ничего не переписывая. 30–50% — убрать чужое каналу (кнопки с телефона, «нажмите» из ВК) и чуть подстроить тон. 80–100% — сильная адаптация под правила карточки канала. Факты и запреты сохраняются. После превью смотрите «расхождение %»: оно должно быть близко к числу, которое вы поставили. Сначала сохраните правила каналов." />
                    </span>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={percent}
                      onChange={(e) => setPercent(Math.max(0, Math.min(100, Number(e.target.value) || 0)))}
                      className="h-8 w-14 rounded-lg bg-white text-center text-sm ring-1 ring-black/10"
                    />
                  </label>
                  <Button type="button" disabled={busy} onClick={() => void preview(d.id)}>
                    Преобразовать
                  </Button>
                  <InfoTip text="Строит таблицу: слева оригинал фрагмента, справа канал и текст (по умолчанию тот же). Можно править до «Применить». Проценты считают, сколько смысла оригинала сохранилось. 100% / 0% — текст не трогали." />
                  <Button type="button" variant="secondary" disabled={busy} onClick={() => void run("reparse", d.id)}>
                    Переразобрать
                  </Button>
                  <InfoTip text="Снова читает файл с диска и режет по разделам 1. 2. 3. Каналы не трогает, пока снова не нажмёте «Преобразовать»." />
                  <button type="button" className="text-xs font-semibold text-primary" onClick={() => void run("remove", d.id)}>
                    Удалить
                  </button>
                </div>
              </div>

              {showPreview ? (
                <div className="mt-4 space-y-3">
                  <p className="text-sm font-semibold">
                    Превью преобразования
                    <InfoTip className="ml-2" text="Каждая строка — фрагмент оригинала. Поле «в канал» решает, в какой столбец попадёт. Поле «станет» можно править; если меняете смысл, вырастет расхождение %. Снимите галочку — фрагмент не пойдёт ни в один канал." />
                  </p>
                  {rows.map((r) => (
                    <div key={r.id} className="rounded-2xl bg-surface-2 p-3 text-sm">
                      <label className="flex items-center gap-2 text-xs font-semibold">
                        <input type="checkbox" checked={r.on} onChange={(e) => patchRow(d.id, r.id, { on: e.target.checked })} />
                        Включить фрагмент
                      </label>
                      <p className="mt-2 text-xs uppercase tracking-wider text-muted">Было</p>
                      <pre className="max-h-40 overflow-auto whitespace-pre-wrap text-[0.8rem]">{r.from}</pre>
                      <div className="mt-2 grid gap-2 md:grid-cols-2">
                        <label>
                          Станет в канале
                          <select
                            value={r.toChannel}
                            onChange={(e) => patchRow(d.id, r.id, { toChannel: e.target.value })}
                            className="mt-1 block h-11 w-full rounded-xl bg-white px-3 ring-1 ring-black/10"
                          >
                            {channels.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.label}
                              </option>
                            ))}
                          </select>
                        </label>
                        <p className="self-end text-xs text-muted">
                          Точность {r.accuracy}% · расхождение {r.drift}%
                        </p>
                      </div>
                      <label className="mt-2 block">
                        Станет (редактируйте, если нужно иначе для канала)
                        <textarea
                          value={r.toText}
                          onChange={(e) => patchRow(d.id, r.id, { toText: e.target.value })}
                          rows={5}
                          className="mt-1 w-full rounded-xl bg-white px-3 py-2 ring-1 ring-black/10"
                        />
                      </label>
                      <p className="mt-1 text-xs text-muted">{r.comment}</p>
                    </div>
                  ))}
                  <Button type="button" disabled={busy} onClick={() => void apply(d.id)}>
                    Применить преобразование
                  </Button>
                </div>
              ) : null}

              <button type="button" className="mt-3 text-sm font-semibold text-primary" onClick={() => setOpen(open === d.id ? "" : d.id)}>
                {open === d.id ? "Скрыть оригинал" : "Показать оригинал файла"}
              </button>
              <InfoTip className="ml-2" text="Полный текст Word/PDF, как извлекли. Столбцы ниже — черновик по маркерам канала или уже применённое преобразование." />
              {open === d.id && d.text ? (
                <pre className="mt-3 max-h-[20rem] overflow-auto whitespace-pre-wrap rounded-2xl bg-surface-2 p-4 text-[0.82rem] leading-relaxed">{d.text}</pre>
              ) : null}
              <div className="mt-4 grid gap-3 overflow-x-auto sm:grid-cols-2 xl:grid-cols-5">
                {channels.map((c) => {
                  const body = columnsOf(d, channels)[c.id] || "";
                  return (
                    <div key={c.id} className={cn("min-w-[14rem] rounded-2xl p-3", c.id === "site" ? "bg-primary/5 ring-1 ring-primary/20" : "bg-surface-2")}>
                      <p className="text-[0.68rem] font-semibold uppercase tracking-wider text-muted">{c.label}</p>
                      <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap text-[0.78rem] leading-relaxed">
                        {body || "Пусто. «Преобразовать» разложит оригинал по столбцам."}
                      </pre>
                    </div>
                  );
                })}
              </div>
            </article>
          );
        })}
        {docs.length ? null : <p className="text-sm text-muted">Документов пока нет — загрузите инструкцию, правила или оферту.</p>}
      </div>
    </div>
  );
}
