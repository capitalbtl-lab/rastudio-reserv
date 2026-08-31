"use client";

import { useEffect, useState } from "react";
import { adminAgentDocs, type DocKind } from "@/data/agent-docs";
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
  mime: string;
  chars: number;
  text?: string;
  items: { id: string; title: string; body: string; on: boolean }[];
  active: boolean;
  status: "ok" | "empty" | "error";
  error?: string;
};

const ZONES: { kind: DocKind; title: string; accept: string; tip: string; help: string }[] = [
  {
    kind: "instruction",
    title: "Инструкция для агента",
    accept: ".pdf,.doc,.docx,.txt,.md,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    tip: "Сюда кладите методичку, как Олег и Ольга должны разговаривать: воронка, запреты, как предлагать пробное. После загрузки файл режется на команды — каждую можно выключить.",
    help: "PDF или Word. Система вытащит текст и разобьёт на пункты. Эти пункты попадут в промпт ассистента.",
  },
  {
    kind: "rules",
    title: "Правила оказания услуг",
    accept: ".pdf,.doc,.docx,.txt,.md,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    tip: "Официальные правила студии: абонемент, пропуск, перевод, опоздание. Если родитель спросит «что если пропустили занятие» — агент ответит из этого файла, а не от себя.",
    help: "Загрузите действующие правила. Агент не выдумывает условия, которых нет в тексте.",
  },
  {
    kind: "offer",
    title: "Договор оферты",
    accept: ".pdf,.doc,.docx,.txt,.md,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    tip: "Публичная оферта: оплата, отказ, персональные данные, пробное. Агент коротко объясняет пункт, не читает договор вслух целиком.",
    help: "Нужен текстовый PDF или Word, не фото страниц без слоя текста.",
  },
  {
    kind: "other",
    title: "Прочие документы",
    accept: ".pdf,.doc,.docx,.txt,.md,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    tip: "Памятки, прайс-пояснения, регламент летних программ, согласие на фото. Всё, что агенту может понадобиться в разговоре с родителем.",
    help: "Любой рабочий документ до 8 МБ.",
  },
];

const KIND_RU: Record<DocKind, string> = {
  instruction: "Инструкция",
  rules: "Правила",
  offer: "Оферта",
  other: "Прочее",
};

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
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [open, setOpen] = useState<string>("");

  async function load() {
    const res = await adminAgentDocs({ data: { token: token(), action: "list" } });
    if (res.ok && "docs" in res) setDocs(res.docs as DocRow[]);
  }

  useEffect(() => {
    void load();
  }, []);

  async function upload(kind: DocKind, file: File) {
    setBusy(true);
    setMsg("Читаю файл и раскладываю на пункты…");
    try {
      const base64 = await toB64(file);
      const res = await adminAgentDocs({
        data: { token: token(), action: "upload", kind, name: file.name, mime: file.type, base64 },
      });
      if (!res.ok) setMsg(res.error || "Не загрузился");
      else {
        setDocs(res.docs as DocRow[]);
        const last = (res.docs as DocRow[])[0];
        setMsg(
          last?.status === "ok"
            ? `Готово: «${last.name}», пунктов ${last.items.length}. Ассистент уже может опираться на документ.`
            : last?.error || "Файл принят, но текст не извлечён.",
        );
        if (last?.id) setOpen(last.id);
      }
    } catch {
      setMsg("Не удалось прочитать файл в браузере.");
    }
    setBusy(false);
  }

  async function run(action: "remove" | "toggle" | "reparse" | "toggleItem", id: string, extra?: { on?: boolean; itemId?: string }) {
    setBusy(true);
    const res = await adminAgentDocs({
      data: { token: token(), action, id, on: extra?.on, itemId: extra?.itemId },
    });
    setBusy(false);
    if (res.ok && "docs" in res) setDocs(res.docs as DocRow[]);
    else setMsg(res.ok ? "" : res.error || "Ошибка");
  }

  return (
    <div className="space-y-6">
      <article className="rounded-3xl bg-surface p-5 shadow-[var(--shadow-border)] md:p-7">
        <div className="flex items-start gap-2">
          <h3 className="font-display text-2xl">Как настраивать документы агента</h3>
          <InfoTip text="Это не чат и не скрипт воронки. Сюда кладут официальные тексты студии. Ассистент читает пункты, когда родитель спрашивает про правила, оплату, отказ или договор." />
        </div>
        <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm leading-relaxed text-fg">
          <li>
            Выберите тип: инструкция, правила, оферта или прочее. Тип говорит агенту, <em>зачем</em> документ, а не только что в нём написано.
          </li>
          <li>
            Нажмите «Загрузить» и укажите PDF или Word. Нужен файл с текстовым слоем. Скан-фото без распознанного текста система не прочитает. Текст не сокращаем: режем по разделам 1. 2. 3. как в файле.
          </li>
          <li>
            После загрузки документ режется на пункты. Проверьте формулировки. Лишнее выключите кружком у пункта — в разговор оно не попадёт.
          </li>
          <li>
            Переключатель «В ответах» включает весь файл. Выключенный документ хранится, но Олег и Ольга его не видят.
          </li>
          <li>
            Если обновили оферту — загрузите новую версию и удалите старую. «Переразобрать» повторяет извлечение, если пункты вышли криво.
          </li>
          <li>
            Агент не заменяет юриста: он коротко объясняет пункт и предлагает открыть документ или позвонить, если вопрос спорный.
          </li>
        </ol>
      </article>

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
          </article>
        ))}
      </div>

      {msg ? <p className="text-sm text-primary">{msg}</p> : null}

      <div className="space-y-3">
        {docs.map((d) => (
          <article key={d.id} className="rounded-3xl bg-surface p-5 shadow-[var(--shadow-border)]">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-display text-lg">{d.name}</p>
                  <InfoTip text={`${KIND_RU[d.kind]}. ${d.chars} знаков текста. ${d.items.length} пунктов. ${d.active ? "Сейчас участвует в ответах." : "Выключен — агент его не видит."}`} />
                </div>
                <p className="mt-1 text-xs text-muted">
                  {KIND_RU[d.kind]} · {new Date(d.at).toLocaleString("ru-RU")} · {d.items.length} пунктов
                  {d.status !== "ok" ? ` · ${d.error || d.status}` : ""}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className={cn("rounded-full px-3 py-1.5 text-xs font-semibold", d.active ? "bg-primary text-primary-foreground" : "bg-surface-2")}
                  onClick={() => void run("toggle", d.id, { on: !d.active })}
                >
                  {d.active ? "В ответах" : "Выключен"}
                </button>
                <Button type="button" variant="secondary" disabled={busy} onClick={() => void run("reparse", d.id)}>
                  Переразобрать
                </Button>
                <button type="button" className="text-xs font-semibold text-primary" onClick={() => void run("remove", d.id)}>
                  Удалить
                </button>
              </div>
            </div>
            <button type="button" className="mt-3 text-sm font-semibold text-primary" onClick={() => setOpen(open === d.id ? "" : d.id)}>
              {open === d.id ? "Скрыть пункты" : "Показать пункты"}
            </button>
            {open === d.id ? (
              <div className="mt-3 space-y-3">
                {d.text ? (
                  <pre className="max-h-[28rem] overflow-auto whitespace-pre-wrap rounded-2xl bg-surface-2 p-4 text-[0.82rem] leading-relaxed text-fg">
                    {d.text}
                  </pre>
                ) : null}
                {d.items.length ? (
                  d.items.map((it) => (
                    <label key={it.id} className="flex gap-3 rounded-2xl bg-surface-2 p-3 text-sm">
                      <input
                        type="checkbox"
                        className="mt-1 shrink-0"
                        checked={it.on}
                        onChange={(e) => void run("toggleItem", d.id, { itemId: it.id, on: e.target.checked })}
                      />
                      <span className="min-w-0">
                        <span className="font-semibold">{it.title}</span>
                        <span className="mt-1 block whitespace-pre-wrap text-muted">{it.body}</span>
                      </span>
                    </label>
                  ))
                ) : (
                  <p className="text-sm text-muted">Пунктов нет — загрузите текстовый файл или нажмите «Переразобрать».</p>
                )}
              </div>
            ) : null}
          </article>
        ))}
        {docs.length ? null : <p className="text-sm text-muted">Документов пока нет — загрузите инструкцию, правила или оферту.</p>}
      </div>
    </div>
  );
}
