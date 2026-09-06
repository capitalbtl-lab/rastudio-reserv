"use client";

import { useEffect, useMemo, useState } from "react";
import { adminAgentLessons } from "@/data/agent-lessons";
import { LESSON_KIND_LABEL, LESSON_KINDS, type AgentLesson, type GraphEdge, type GraphNode, type LessonKind } from "@/data/agent-lessons-core";
import { Button } from "@/components/ui/button";
import { InfoTip } from "@/components/info-tip";
import { AdminSaveBar } from "@/components/admin-save-bar";
import { cn } from "@/lib/utils";

function token() {
  if (typeof document === "undefined") return "";
  const m = document.cookie.match(/(?:^|;\s*)ra_admin=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : localStorage.getItem("ra_admin") || "";
}

const KIND_COLOR: Record<LessonKind, string> = {
  reply: "#205edc",
  crm: "#0f766e",
  flow: "#b45309",
  id: "#6d28d9",
};

function when(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function layout(nodes: GraphNode[]) {
  const cols: Record<GraphNode["type"], GraphNode[]> = { intent: [], lesson: [], action: [], entity: [] };
  for (const n of nodes) cols[n.type].push(n);
  const colX = { intent: 28, lesson: 210, action: 420, entity: 420 };
  const placed: { n: GraphNode; x: number; y: number }[] = [];
  (["intent", "lesson"] as const).forEach((type) => {
    cols[type].forEach((n, i) => placed.push({ n, x: colX[type], y: 28 + i * 56 }));
  });
  [...cols.action, ...cols.entity].forEach((n, i) => {
    placed.push({ n, x: n.type === "entity" ? 560 : 420, y: 28 + i * 56 });
  });
  return placed;
}

export function AdminLessonMap() {
  const [lessons, setLessons] = useState<AgentLesson[]>([]);
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [edges, setEdges] = useState<GraphEdge[]>([]);
  const [filter, setFilter] = useState<LessonKind | "all">("all");
  const [kind, setKind] = useState<LessonKind>("reply");
  const [intent, setIntent] = useState("отработка");
  const [wrong, setWrong] = useState("");
  const [right, setRight] = useState("");
  const [action, setAction] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    const res = await adminAgentLessons({ data: { token: token(), action: "get" } });
    if (res.ok && "lessons" in res) {
      setLessons(res.lessons);
      setNodes(res.graph.nodes);
      setEdges(res.graph.edges);
    } else setMsg(res.ok ? "" : res.error || "Не удалось загрузить карту.");
  }

  useEffect(() => {
    void load();
  }, []);

  const shown = useMemo(() => (filter === "all" ? lessons : lessons.filter((l) => l.kind === filter)), [lessons, filter]);
  const placed = useMemo(() => layout(nodes), [nodes]);
  const pos = useMemo(() => new Map(placed.map((p) => [p.n.id, p])), [placed]);
  const h = Math.max(180, placed.reduce((m, p) => Math.max(m, p.y), 0) + 48);

  async function add() {
    setBusy(true);
    const res = await adminAgentLessons({
      data: { token: token(), action: "add", lesson: { kind, intent, wrong, right, action, source: "admin" } },
    });
    setBusy(false);
    if (res.ok && "lessons" in res) {
      setLessons(res.lessons);
      setNodes(res.graph.nodes);
      setEdges(res.graph.edges);
      setWrong("");
      setRight("");
      setMsg("Урок на карте. Консультант на сайте уже читает.");
    } else setMsg(res.ok ? "" : res.error || "Ошибка");
  }

  async function toggle(id: string) {
    const res = await adminAgentLessons({ data: { token: token(), action: "toggle", lesson: { id } } });
    if (res.ok && "lessons" in res) {
      setLessons(res.lessons);
      setNodes(res.graph.nodes);
      setEdges(res.graph.edges);
    }
  }

  async function remove(id: string) {
    const res = await adminAgentLessons({ data: { token: token(), action: "remove", lesson: { id } } });
    if (res.ok && "lessons" in res) {
      setLessons(res.lessons);
      setNodes(res.graph.nodes);
      setEdges(res.graph.edges);
    }
  }

  return (
    <div className="space-y-6">
      <p className="max-w-3xl text-sm text-muted">
        Голосом в админ-режиме чата: «неправильно… надо…». Типы: текст ответа, действие в CRM, ход разговора, ключ ID. Узел на карте — живой урок, консультант читает его сразу. Карта ID разделов — вкладка «База знаний».
      </p>

      <div className="overflow-x-auto rounded-3xl bg-surface p-4 shadow-[var(--shadow-border)]">
        <p className="mb-2 text-sm font-semibold">
          Карта связей <InfoTip text="Слева намерение (отработка, набор). В центре урок. Справа действие CRM и ключ. Выключенный урок с карты снимается, с диска не стирается." />
        </p>
        {nodes.length ? (
          <svg viewBox={`0 0 720 ${h}`} className="h-auto w-full min-w-[640px]" role="img" aria-label="Карта обучения">
            {edges.map((e, i) => {
              const a = pos.get(e.from);
              const b = pos.get(e.to);
              if (!a || !b) return null;
              return (
                <line
                  key={`${e.from}-${e.to}-${i}`}
                  x1={a.x + 86}
                  y1={a.y + 14}
                  x2={b.x}
                  y2={b.y + 14}
                  stroke={e.rel === "does" ? "#0f766e" : e.rel === "binds" ? "#6d28d9" : "#205edc"}
                  strokeWidth="1.4"
                  opacity="0.45"
                />
              );
            })}
            {placed.map(({ n, x, y }) => (
              <g key={n.id} transform={`translate(${x} ${y})`}>
                <rect
                  width={n.type === "lesson" ? 176 : 120}
                  height="32"
                  rx="16"
                  fill={n.type === "lesson" ? KIND_COLOR[n.kind || "reply"] : n.type === "intent" ? "#111827" : n.type === "action" ? "#0f766e" : "#6d28d9"}
                />
                <text x="12" y="21" fill="#fff" fontSize="11" fontWeight="600">
                  {(n.type === "intent" ? "тема · " : n.type === "action" ? "CRM · " : n.type === "entity" ? "ID · " : "") + n.label.slice(0, 22)}
                </text>
              </g>
            ))}
          </svg>
        ) : (
          <p className="py-8 text-sm text-muted">Пока пусто. Скажите в админ-режиме чата, что ответили неправильно и как надо — узел появится здесь.</p>
        )}
        <div className="mt-3 flex flex-wrap gap-2 text-[0.68rem] font-semibold">
          {LESSON_KINDS.map((k) => (
            <span key={k} className="inline-flex items-center gap-1.5 rounded-full bg-surface-2 px-2 py-1">
              <span className="size-2 rounded-full" style={{ background: KIND_COLOR[k] }} />
              {LESSON_KIND_LABEL[k]}
            </span>
          ))}
        </div>
      </div>

      <div className="rounded-3xl bg-surface p-5 shadow-[var(--shadow-border)]">
        <p className="text-sm font-semibold">Новый урок вручную</p>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <label className="text-sm">
            Тип рекомендации
            <select value={kind} onChange={(e) => setKind(e.target.value as LessonKind)} className="mt-1 block h-11 w-full rounded-xl bg-surface-2 px-3 ring-1 ring-black/10">
              {LESSON_KINDS.map((k) => (
                <option key={k} value={k}>
                  {LESSON_KIND_LABEL[k]}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            Тема
            <input value={intent} onChange={(e) => setIntent(e.target.value)} className="mt-1 block h-11 w-full rounded-xl bg-surface-2 px-3 ring-1 ring-black/10" />
          </label>
        </div>
        <label className="mt-3 block text-sm">
          Было неправильно
          <textarea value={wrong} onChange={(e) => setWrong(e.target.value)} rows={2} className="mt-1 w-full rounded-xl bg-surface-2 px-3 py-2 ring-1 ring-black/10" />
        </label>
        <label className="mt-3 block text-sm">
          Как надо
          <textarea value={right} onChange={(e) => setRight(e.target.value)} rows={3} className="mt-1 w-full rounded-xl bg-surface-2 px-3 py-2 ring-1 ring-black/10" />
        </label>
        <label className="mt-3 block text-sm">
          Действие CRM (если есть)
          <input value={action} onChange={(e) => setAction(e.target.value)} placeholder="book_lesson · note_skip · pause_classes · assign_tariff" className="mt-1 block h-11 w-full rounded-xl bg-surface-2 px-3 ring-1 ring-black/10" />
        </label>
        <AdminSaveBar>
          <Button type="button" disabled={busy || !right.trim()} onClick={() => void add()}>
            Повесить на карту
          </Button>
        </AdminSaveBar>
      </div>

      {msg ? <p className="text-sm text-primary">{msg}</p> : null}

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => setFilter("all")} className={cn("rounded-full px-3 py-1.5 text-[0.78rem] font-semibold", filter === "all" ? "bg-primary text-primary-foreground" : "bg-surface")}>
          Все {lessons.length}
        </button>
        {LESSON_KINDS.map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setFilter(k)}
            className={cn("rounded-full px-3 py-1.5 text-[0.78rem] font-semibold", filter === k ? "bg-primary text-primary-foreground" : "bg-surface")}
          >
            {LESSON_KIND_LABEL[k]}
          </button>
        ))}
      </div>

      <ul className="space-y-3">
        {shown.map((l) => (
          <li key={l.id} className="rounded-3xl bg-surface p-4 shadow-[var(--shadow-border)]">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-sm font-semibold">
                  {LESSON_KIND_LABEL[l.kind]} · {l.intent}
                  {l.action ? ` → ${l.action}` : ""}
                </p>
                <p className="mt-1 text-[0.72rem] text-muted">
                  {when(l.at)} · {l.source} · {l.on ? "в промпте" : "снят"}
                </p>
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => void toggle(l.id)} className="h-8 rounded-full bg-surface-2 px-3 text-[0.72rem] font-semibold">
                  {l.on ? "Выключить" : "Включить"}
                </button>
                <button type="button" onClick={() => void remove(l.id)} className="h-8 rounded-full bg-surface-2 px-3 text-[0.72rem] font-semibold text-muted">
                  С карты
                </button>
              </div>
            </div>
            {l.wrong ? <p className="mt-2 text-sm text-muted">Было: {l.wrong}</p> : null}
            <p className="mt-1 text-sm">Надо: {l.right}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
