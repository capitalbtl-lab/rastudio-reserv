"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { clientCardId, CRM_BRANCH, groupCardId } from "@/data/ids";
import { ADMIN_PANEL_BLUE } from "@/data/admin-ui";
import { displayPersonName, displayParent, initialsOf, statusLabel } from "@/data/client-display";
import {
  CARD_LESSON_TYPES,
  CARD_PAY_KINDS,
  CARD_STUDY_STATUS,
  type CustomerCard,
  type CustomerComm,
  type ClientLesson,
  type ClientRegular,
  type LessonCatalog,
  type TariffOffer,
} from "@/data/crm-cards";
import { Button } from "@/components/ui/button";
import { LessonStrip, toYmd } from "@/components/lesson-strip";
import type { GroupCalLesson } from "@/data/crm-slots-core";

function money(n?: number) {
  return `${Number(n || 0).toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₽`;
}

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function durationMins(from?: string, to?: string) {
  const a = String(from || "").split(":").map(Number);
  const b = String(to || "").split(":").map(Number);
  if (a.length < 2 || b.length < 2) return 0;
  const n = b[0] * 60 + b[1] - (a[0] * 60 + a[1]);
  return n > 0 && n <= 480 ? n : 0;
}

const fieldCtl = "h-9 w-full rounded-md bg-white px-2 text-sm ring-1 ring-black/10";

function Field({ label, required, children }: { label: string; required?: boolean; children: ReactNode }) {
  return (
    <label className="grid grid-cols-[8.6rem_minmax(0,1fr)] items-center gap-3 text-[0.82rem]">
      <span className="text-muted">
        {label}
        {required ? <span className="text-red-500"> *</span> : null}
      </span>
      {children}
    </label>
  );
}

function Comm({ c }: { c: CustomerComm }) {
  return (
    <div className={cn("rounded-xl px-3 py-2 text-sm ring-1 ring-black/6", c.incoming ? "bg-white" : "bg-primary/8")}>
      <p className="text-[0.68rem] font-semibold uppercase tracking-wider text-muted">
        {[c.at, c.channel, c.who].filter(Boolean).join(" · ")}
        {c.incoming ? " · входящее" : ""}
      </p>
      <p className="mt-1 whitespace-pre-wrap leading-relaxed">{c.text}</p>
    </div>
  );
}

function weekdayNum(label: string) {
  const s = String(label || "")
    .toLowerCase()
    .replace(/ё/g, "е");
  const map: [string, number][] = [
    ["понедельник", 1],
    ["вторник", 2],
    ["среда", 3],
    ["четверг", 4],
    ["пятница", 5],
    ["суббота", 6],
    ["воскресенье", 7],
    ["пн", 1],
    ["вт", 2],
    ["ср", 3],
    ["чт", 4],
    ["пт", 5],
    ["сб", 6],
    ["вс", 7],
  ];
  for (const [k, n] of map) if (s === k || s.startsWith(k)) return n;
  return 0;
}

function lessonsForCard(calendar: ClientLesson[] | undefined, regular: ClientRegular[] | undefined): GroupCalLesson[] {
  const out: GroupCalLesson[] = [];
  const seen = new Set<string>();
  for (const l of calendar || []) {
    const date = toYmd(l.date);
    if (!date || date.length < 10) continue;
    const key = `${date}|${l.from}|${l.group}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      date,
      from: l.from,
      to: l.to,
      status: Number(l.status || 0) || 1,
      type: l.type || "Групповое",
      typeId: l.typeId || undefined,
      teacher: l.teacher,
      subject: l.subject,
      group: l.group,
      room: l.room,
      lessonId: l.id || undefined,
    });
  }
  if (out.length >= 4) return out.sort((a, b) => a.date.localeCompare(b.date));
  const d0 = new Date();
  d0.setHours(12, 0, 0, 0);
  for (const r of regular || []) {
    const wd = weekdayNum(r.day);
    if (!wd) continue;
    const jsWant = wd === 7 ? 0 : wd;
    for (let i = -56; i <= 126; i++) {
      const cur = new Date(d0);
      cur.setDate(d0.getDate() + i);
      if (cur.getDay() !== jsWant) continue;
      const date = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}-${String(cur.getDate()).padStart(2, "0")}`;
      const key = `${date}|${r.from}|${r.groupName}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        date,
        from: r.from,
        to: r.to,
        status: 1,
        type: "Групповое",
        teacher: r.teacher,
        subject: r.subject,
        group: r.groupName,
      });
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

type CardAction = "customerSave" | "customerLesson" | "customerPay" | "customerTariff";

export function CrmClientCard({
  card,
  loading,
  onClose,
  onOpenGroup,
  onAction,
  backLabel,
  variant = "overlay",
}: {
  card: CustomerCard;
  loading?: boolean;
  onClose: () => void;
  onOpenGroup?: (groupId: number, branchId: number) => void;
  onAction?: (action: CardAction, extra?: Record<string, unknown>) => Promise<void>;
  backLabel?: string;
  variant?: "overlay" | "panel";
}) {
  const id = Number(card.id) || 0;
  const cardKey = card.cardId || clientCardId(id);
  const title = displayPersonName(card.name, card.parent, card.phones[0]);
  const parent = displayParent(card.name, card.parent);
  const branch = CRM_BRANCH[card.branchId]?.short || "";
  const [name, setName] = useState(card.name);
  const [legal, setLegal] = useState(card.parent);
  const [phone, setPhone] = useState(card.phones[0] || "");
  const [email, setEmail] = useState(card.emails[0] || "");
  const [note, setNote] = useState(card.note);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");
  const [channel, setChannel] = useState("");
  const [payKind, setPayKind] = useState("");
  const [paySum, setPaySum] = useState("");
  const [lessonKey, setLessonKey] = useState("");
  const [lessonOpen, setLessonOpen] = useState(false);
  const [lessonDate, setLessonDate] = useState(todayIso());
  const [lessonTime, setLessonTime] = useState(card.regular?.[0]?.from || "16:00");
  const [lessonMins, setLessonMins] = useState(90);
  const [lessonGroup, setLessonGroup] = useState(0);
  const [lessonSubject, setLessonSubject] = useState(0);
  const [lessonTeacher, setLessonTeacher] = useState(0);
  const [lessonRoom, setLessonRoom] = useState(0);
  const [lessonTopic, setLessonTopic] = useState("");
  const [lessonNote, setLessonNote] = useState("");
  const [tariffOpen, setTariffOpen] = useState(false);
  const [tariffId, setTariffId] = useState(0);
  const [tariffDate, setTariffDate] = useState(todayIso());

  useEffect(() => {
    setName(card.name);
    setLegal(card.parent);
    setPhone(card.phones[0] || "");
    setEmail(card.emails[0] || "");
    setNote(card.note);
    setLessonTime(card.regular?.[0]?.from || "");
  }, [card]);

  const channels = useMemo(() => {
    const set = new Set(card.comms.map((c) => c.channel || "сообщение"));
    return [...set];
  }, [card.comms]);
  const comms = channel ? card.comms.filter((c) => (c.channel || "сообщение") === channel) : card.comms;
  const tiles = useMemo(() => lessonsForCard(card.calendar, card.regular), [card.calendar, card.regular]);
  const catalog: LessonCatalog = card.catalog || { subjects: [], teachers: [], rooms: [], tariffs: [] };
  const tariffOffers: TariffOffer[] = catalog.tariffs || [];

  function applyGroup(id: number) {
    setLessonGroup(id);
    const g = (card.groups || []).find((x) => x.id === id);
    const reg = (card.regular || []).find((r) => r.groupId === id);
    if (g?.subjectId) setLessonSubject(g.subjectId);
    else if (reg?.subjectId) setLessonSubject(reg.subjectId);
    if (reg?.from) setLessonTime(reg.from);
    const mins = durationMins(reg?.from, reg?.to);
    if (mins) setLessonMins(mins);
    if (reg?.teacherId) setLessonTeacher(reg.teacherId);
    if (reg?.roomId) setLessonRoom(reg.roomId);
  }

  function openLesson(key: string) {
    const g = (card.groups || []).find((x) => x.active !== false) || (card.groups || [])[0];
    const reg = (card.regular || []).find((r) => r.groupId === g?.id) || (card.regular || [])[0];
    setLessonKey(key);
    setLessonDate(todayIso());
    setLessonTime(reg?.from || "16:00");
    setLessonMins(durationMins(reg?.from, reg?.to) || 90);
    setLessonGroup(g?.id || 0);
    setLessonSubject(g?.subjectId || reg?.subjectId || 0);
    setLessonTeacher(reg?.teacherId || 0);
    setLessonRoom(reg?.roomId || 0);
    setLessonTopic("");
    setLessonNote("");
    setLessonOpen(true);
  }

  function openTariff() {
    const subIds = (card.groups || []).map((g) => Number(g.subjectId) || 0).filter(Boolean);
    const preferred =
      tariffOffers.find((t) => (t.subjectIds || []).some((id) => subIds.includes(id))) || tariffOffers[0];
    setTariffId(preferred?.id || 0);
    setTariffDate(todayIso());
    setTariffOpen(true);
  }

  const pickedTariff = tariffOffers.find((t) => t.id === tariffId);

  const typeName = CARD_LESSON_TYPES.find((t) => t.key === lessonKey)?.name || "Занятие";
  const subjectOpts = useMemo(() => {
    const list = [...(catalog.subjects || [])];
    if (lessonSubject && !list.some((s) => s.id === lessonSubject)) {
      const g = (card.groups || []).find((x) => x.subjectId === lessonSubject);
      const r = (card.regular || []).find((x) => x.subjectId === lessonSubject);
      list.unshift({ id: lessonSubject, name: r?.subject || g?.name || `предмет ${lessonSubject}` });
    }
    return list;
  }, [catalog.subjects, lessonSubject, card.groups, card.regular]);
  const teacherOpts = useMemo(() => {
    const list = [...(catalog.teachers || [])];
    if (lessonTeacher && !list.some((s) => s.id === lessonTeacher)) {
      const r = (card.regular || []).find((x) => x.teacherId === lessonTeacher);
      list.unshift({ id: lessonTeacher, name: r?.teacher || `педагог ${lessonTeacher}` });
    }
    return list;
  }, [catalog.teachers, lessonTeacher, card.regular]);

  async function run(action: CardAction, extra?: Record<string, unknown>) {
    if (!onAction) return;
    setBusy(action);
    setMsg("");
    try {
      await onAction(action, extra);
      setMsg("Сохранено в AlfaCRM.");
      setPayKind("");
      setLessonKey("");
      setLessonOpen(false);
      setTariffOpen(false);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Не удалось сохранить.");
    } finally {
      setBusy("");
    }
  }

  const article = (
    <article
      className={cn(
        "relative flex flex-col overflow-hidden",
        variant === "overlay"
          ? "max-h-[min(92vh,960px)] w-full max-w-4xl rounded-[1.4rem] shadow-[0_22px_60px_rgba(15,23,42,0.28)]"
          : "h-full min-h-0 rounded-[1.2rem] ring-1 ring-black/6",
      )}
      style={{ background: ADMIN_PANEL_BLUE }}
      onClick={variant === "overlay" ? (e) => e.stopPropagation() : undefined}
      data-card-id={cardKey}
      data-customer-id={id || undefined}
      data-is-study={card.isStudy ?? (card.status === "учится" ? 1 : card.status === "архив" ? 2 : 0)}
      data-balance={card.balance ?? 0}
    >
      <header className="flex shrink-0 items-start justify-between gap-3 px-4 pt-4 md:px-5">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white text-sm font-semibold text-primary ring-1 ring-black/6">
            {initialsOf(title)}
          </span>
          <div className="min-w-0">
            <p className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-muted">{cardKey}</p>
            <h4 className="font-display mt-0.5 text-[1.35rem] leading-tight">{title || (loading ? "Загружаю…" : "Без имени")}</h4>
            <p className="mt-1 flex flex-wrap items-center gap-1 text-[0.78rem] text-muted">
              {card.gender ? <span>{card.gender}</span> : null}
              {card.age ? <span>{card.age}</span> : null}
              {branch ? <span>{branch}</span> : null}
              {id ? <span className="font-mono text-[0.7rem]">customerId {id}</span> : null}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            type="button"
            size="sm"
            className="h-9"
            data-op="save-contacts"
            disabled={!onAction || Boolean(busy)}
            onClick={() => void run("customerSave", { patch: { name, parent: legal, phone, email, note } })}
          >
            {busy === "customerSave" ? "Сохраняю…" : "Сохранить"}
          </Button>
          {variant !== "panel" ? (
            <button type="button" className="shrink-0 rounded-full bg-white px-3 py-1 text-sm font-semibold text-muted ring-1 ring-black/8" onClick={onClose}>
              {backLabel || "Закрыть"}
            </button>
          ) : null}
        </div>
      </header>

      <div className="pretty-scroll mt-3 min-h-0 flex-1 overflow-y-auto px-4 pb-5 md:px-5">
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            data-op="set-client-status"
            data-is-study="1"
            disabled={!onAction || Boolean(busy)}
            onClick={() => void run("customerSave", { isStudy: 1 })}
            className={cn("rounded-full px-2.5 py-1 text-[0.72rem] font-semibold", card.status === "учится" ? "bg-primary text-white" : "bg-white ring-1 ring-black/8")}
          >
            Клиент
          </button>
          <button
            type="button"
            data-op="set-client-status"
            data-is-study="0"
            disabled={!onAction || Boolean(busy)}
            onClick={() => void run("customerSave", { isStudy: 0 })}
            className={cn("rounded-full px-2.5 py-1 text-[0.72rem] font-semibold", card.status === "лид" ? "bg-amber-500 text-white" : "bg-white ring-1 ring-black/8")}
          >
            Лид
          </button>
          <select
            value={card.studyStatusId || ""}
            data-op="study-status"
            disabled={!onAction || Boolean(busy)}
            onChange={(e) => void run("customerSave", { studyStatusId: Number(e.target.value) || 0 })}
            className="h-7 rounded-full bg-white px-2 text-[0.72rem] font-semibold ring-1 ring-black/8"
          >
            <option value="">состояние</option>
            {CARD_STUDY_STATUS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <span className={cn("rounded-full px-2.5 py-1 text-[0.72rem] font-semibold", card.status === "учится" ? "bg-primary/12 text-primary" : "bg-black/8 text-muted")}>
            {statusLabel(card.status)}
            {card.studyStatus ? ` · ${card.studyStatus}` : ""}
          </span>
        </div>

        <div className="mt-3 rounded-2xl bg-white/80 px-3 py-3 ring-1 ring-black/6">
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-[0.68rem] font-semibold uppercase tracking-wider text-muted">Остаток</p>
            <p className="font-display text-xl leading-none">{money(card.balance)}</p>
          </div>
          <p className="mt-1 text-[0.78rem] text-muted">{card.lessonsLeft || 0} уроков · оплачено до {card.paidTill || "—"}</p>
          {(card.tariffs || []).filter((t) => !t.archived).length ? (
            <ul className="mt-2 space-y-1 text-[0.78rem]">
              {(card.tariffs || [])
                .filter((t) => !t.archived)
                .map((t) => (
                  <li key={t.id}>
                    {t.name}: {money(t.rest)} · {t.lessons} ур.
                  </li>
                ))}
            </ul>
          ) : null}
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {CARD_PAY_KINDS.map((p) => (
              <button
                key={p.id}
                type="button"
                data-op="add-pay"
                data-pay-kind={p.id}
                className={cn("rounded-full px-2.5 py-1 text-[0.72rem] font-semibold", payKind === p.id ? "bg-primary text-white" : "bg-surface-2")}
                onClick={() => setPayKind(p.id)}
              >
                {p.name}
              </button>
            ))}
            <Button
              type="button"
              size="sm"
              data-op="add-tariff"
              disabled={!onAction || Boolean(busy)}
              onClick={() => openTariff()}
            >
              Добавить абонемент
            </Button>
          </div>
          {payKind ? (
            <div className="mt-2 flex gap-2">
              <input
                value={paySum}
                onChange={(e) => setPaySum(e.target.value)}
                placeholder="сумма"
                className="h-9 flex-1 rounded-lg bg-white px-2 text-sm ring-1 ring-black/8"
              />
              <Button
                type="button"
                size="sm"
                className="h-9"
                data-op="customerPay"
                disabled={Boolean(busy)}
                onClick={() => void run("customerPay", { payKind, sum: Number(String(paySum).replace(",", ".")) })}
              >
                Провести
              </Button>
            </div>
          ) : null}
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <label className="min-w-0 text-[0.68rem] font-semibold uppercase tracking-wider text-muted">
            Ребёнок
            <input value={name} onChange={(e) => setName(e.target.value)} className="mt-1 h-9 w-full rounded-lg bg-white px-2 text-sm font-medium ring-1 ring-black/8" />
          </label>
          <label className="min-w-0 text-[0.68rem] font-semibold uppercase tracking-wider text-muted">
            Заказчик
            <input value={legal} onChange={(e) => setLegal(e.target.value)} className="mt-1 h-9 w-full rounded-lg bg-white px-2 text-sm font-medium ring-1 ring-black/8" />
          </label>
          <label className="min-w-0 text-[0.68rem] font-semibold uppercase tracking-wider text-muted">
            Телефон
            <input value={phone} onChange={(e) => setPhone(e.target.value)} className="mt-1 h-9 w-full rounded-lg bg-white px-2 text-sm ring-1 ring-black/8" />
          </label>
          <label className="min-w-0 text-[0.68rem] font-semibold uppercase tracking-wider text-muted">
            Заметка
            <input value={note} onChange={(e) => setNote(e.target.value)} className="mt-1 h-9 w-full rounded-lg bg-white px-2 text-sm ring-1 ring-black/8" />
          </label>
          <label className="min-w-0 text-[0.68rem] font-semibold uppercase tracking-wider text-muted">
            Почта
            <input value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1 h-9 w-full rounded-lg bg-white px-2 text-sm ring-1 ring-black/8" />
          </label>
        </div>
        {card.dob ? <p className="mt-2 text-[0.78rem] text-muted">Дата рождения {card.dob}{card.age ? ` · ${card.age}` : ""}</p> : null}

        <div className="mt-4">
          <p className="text-[0.68rem] font-semibold uppercase tracking-wider text-muted">Группы и регулярные уроки · groupId</p>
          {(card.groups || []).length ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {(card.groups || []).map((g) => (
                <button
                  key={`${g.branchId}-${g.id}`}
                  type="button"
                  data-group-id={g.id}
                  data-branch-id={g.branchId}
                  data-card-id={groupCardId(g.branchId, g.id)}
                  className={cn("rounded-full px-3 py-1.5 text-sm font-semibold ring-1", g.active ? "bg-white text-primary ring-primary/25" : "bg-white/50 text-muted ring-black/8")}
                  onClick={() => onOpenGroup?.(g.id, g.branchId)}
                  title={groupCardId(g.branchId, g.id)}
                >
                  {g.name || `группа ${g.id}`}
                  <span className="ml-1 font-mono text-[0.68rem] opacity-60">{g.id}</span>
                </button>
              ))}
            </div>
          ) : (
            <p className="mt-1 text-sm text-muted">Группа не привязана.</p>
          )}
          {(card.regular || []).length ? (
            <ul className="mt-2 space-y-1.5">
              {(card.regular || []).map((r, i) => (
                <li key={`${r.groupId}-${r.day}-${r.from}-${i}`} className="rounded-xl bg-white px-3 py-2 text-sm ring-1 ring-black/6">
                  <p className="font-semibold">
                    {r.day} {r.from}–{r.to}
                  </p>
                  <p className="text-[0.78rem] text-muted">{[r.groupName, r.subject, r.teacher, r.branch].filter(Boolean).join(" · ")}</p>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        <div className="mt-4 rounded-2xl bg-white/70 px-3 py-3 ring-1 ring-black/6">
          <LessonStrip
            lessons={tiles}
            title="Ближайшие занятия"
            group={(card.groups || [])[0]?.name}
            teacher={card.teacher || (card.regular || [])[0]?.teacher}
            subject={(card.regular || [])[0]?.subject}
          />
        </div>

        <div className="mt-4">
          <p className="text-[0.68rem] font-semibold uppercase tracking-wider text-muted">Назначить занятие</p>
          <div className="mt-2 flex flex-wrap gap-1">
            {CARD_LESSON_TYPES.map((t) => (
              <button
                key={t.key}
                type="button"
                data-op="assign-lesson"
                data-lesson-type={t.key}
                data-lesson-type-id={t.id}
                className="rounded-full bg-white px-2.5 py-1 text-[0.72rem] font-semibold ring-1 ring-black/8 hover:bg-primary hover:text-white hover:ring-primary"
                onClick={() => openLesson(t.key)}
              >
                {t.name}
              </button>
            ))}
          </div>
        </div>

        {card.url ? (
          <a href={card.url} target="_blank" rel="noreferrer" className="mt-3 inline-block text-sm font-semibold text-primary">
            Открыть в AlfaCRM
          </a>
        ) : null}

        <div className="mt-5">
          <div className="flex flex-wrap items-center gap-1.5">
            <p className="font-display text-lg">Коммуникации</p>
            <button type="button" onClick={() => setChannel("")} className={cn("rounded-full px-2 py-0.5 text-[0.7rem] font-semibold", !channel ? "bg-fg text-white" : "bg-white ring-1 ring-black/8")}>
              Все
            </button>
            {channels.map((ch) => (
              <button
                key={ch}
                type="button"
                onClick={() => setChannel(ch)}
                className={cn("rounded-full px-2 py-0.5 text-[0.7rem] font-semibold", channel === ch ? "bg-fg text-white" : "bg-white ring-1 ring-black/8")}
              >
                {ch}
              </button>
            ))}
          </div>
          {loading && !card.comms.length ? <p className="mt-2 text-sm text-muted">Подгружаю карточку из AlfaCRM…</p> : null}
          {comms.length ? (
            <div className="mt-2 space-y-2">
              {comms.map((c, i) => (
                <Comm key={c.id || i} c={c} />
              ))}
            </div>
          ) : loading ? null : (
            <p className="mt-2 text-sm text-muted">Переписки в карточке пока нет.</p>
          )}
        </div>
        {msg ? <p className="mt-3 text-sm font-medium text-primary">{msg}</p> : null}
        {busy ? <p className="mt-1 text-sm text-muted">Пишу в AlfaCRM…</p> : null}
      </div>
    </article>
  );

  const dialog = lessonOpen ? (
    <div className="fixed inset-0 z-[250] flex items-center justify-center bg-black/45 p-4" onClick={() => setLessonOpen(false)} data-op="lesson-dialog">
      <div className="w-full max-w-[34rem] rounded-xl bg-white shadow-[0_18px_50px_rgba(15,23,42,0.28)]" onClick={(e) => e.stopPropagation()}>
        <header className="flex items-center justify-between border-b border-black/8 px-5 py-3">
          <h3 className="font-display text-lg">{typeName} — запланировать</h3>
          <button type="button" className="rounded-full px-2 py-1 text-sm text-muted hover:bg-surface-2" onClick={() => setLessonOpen(false)} aria-label="Закрыть">
            ×
          </button>
        </header>
        <div className="space-y-3 px-5 py-4">
          <Field label="Тип занятия" required>
            <select value={lessonKey} onChange={(e) => setLessonKey(e.target.value)} className={fieldCtl} data-lesson-type={lessonKey}>
              {CARD_LESSON_TYPES.map((t) => (
                <option key={t.key} value={t.key}>
                  {t.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Дата" required>
            <input type="date" value={lessonDate} onChange={(e) => setLessonDate(e.target.value)} className={fieldCtl} />
          </Field>
          <Field label="Время" required>
            <div className="flex items-center gap-2">
              <span className="text-muted">с</span>
              <input value={lessonTime} onChange={(e) => setLessonTime(e.target.value)} placeholder="16:00" className={cn(fieldCtl, "max-w-[7rem]")} />
              <span className="text-muted">мин</span>
              <input
                type="number"
                min={15}
                max={480}
                value={lessonMins}
                onChange={(e) => setLessonMins(Number(e.target.value) || 0)}
                className={cn(fieldCtl, "max-w-[5.5rem]")}
              />
            </div>
          </Field>
          <Field label="Аудитория">
            <div className="flex items-center gap-2">
              <select value={lessonRoom || ""} onChange={(e) => setLessonRoom(Number(e.target.value) || 0)} className={fieldCtl}>
                <option value="">(не задан)</option>
                {(catalog.rooms || []).map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
              {(catalog.rooms || []).length ? (
                <span className="shrink-0 text-[0.75rem] text-muted">{catalog.rooms.length} доступно</span>
              ) : null}
            </div>
          </Field>
          <Field label="Группа">
            <select value={lessonGroup || ""} onChange={(e) => applyGroup(Number(e.target.value) || 0)} className={fieldCtl}>
              <option value="">не выбрана</option>
              {(card.groups || []).map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name || `группа ${g.id}`}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Предмет" required>
            <select value={lessonSubject || ""} onChange={(e) => setLessonSubject(Number(e.target.value) || 0)} className={fieldCtl}>
              <option value="">выберите</option>
              {subjectOpts.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Педагог">
            <select value={lessonTeacher || ""} onChange={(e) => setLessonTeacher(Number(e.target.value) || 0)} className={fieldCtl}>
              <option value="">выберите</option>
              {teacherOpts.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Тема">
            <input value={lessonTopic} onChange={(e) => setLessonTopic(e.target.value)} placeholder="(не задан)" className={fieldCtl} />
          </Field>
          <Field label="Комментарий">
            <textarea value={lessonNote} onChange={(e) => setLessonNote(e.target.value)} rows={2} placeholder="Например, задержится на 10 мин" className="w-full rounded-md bg-white px-2 py-1.5 text-sm ring-1 ring-black/10" />
          </Field>
        </div>
        <footer className="flex items-center justify-end gap-2 border-t border-black/8 px-5 py-3">
          <button type="button" className="h-9 rounded-full px-4 text-sm font-semibold text-muted hover:bg-surface-2" onClick={() => setLessonOpen(false)}>
            Отмена
          </button>
          <Button
            type="button"
            size="sm"
            className="h-9"
            data-op="customerLesson"
            disabled={!onAction || Boolean(busy) || !lessonSubject}
            onClick={() =>
              void run("customerLesson", {
                lessonType: lessonKey,
                date: lessonDate,
                time: lessonTime,
                duration: lessonMins,
                groupId: lessonGroup || undefined,
                subjectId: lessonSubject || undefined,
                roomId: lessonRoom || undefined,
                teacherId: lessonTeacher || undefined,
                topic: lessonTopic || undefined,
                note: lessonNote || undefined,
              })
            }
          >
            {busy === "customerLesson" ? "Сохраняю…" : "Сохранить"}
          </Button>
        </footer>
      </div>
    </div>
  ) : null;
  const dialogNode = dialog && typeof document !== "undefined" ? createPortal(dialog, document.body) : dialog;

  const tariffDialog = tariffOpen ? (
    <div className="fixed inset-0 z-[250] flex items-center justify-center bg-black/45 p-4" onClick={() => setTariffOpen(false)} data-op="tariff-dialog">
      <div className="w-full max-w-[34rem] rounded-xl bg-white shadow-[0_18px_50px_rgba(15,23,42,0.28)]" onClick={(e) => e.stopPropagation()}>
        <header className="flex items-center justify-between border-b border-black/8 px-5 py-3">
          <h3 className="font-display text-lg">Добавить абонемент</h3>
          <button type="button" className="rounded-full px-2 py-1 text-sm text-muted hover:bg-surface-2" onClick={() => setTariffOpen(false)} aria-label="Закрыть">
            ×
          </button>
        </header>
        <div className="space-y-3 px-5 py-4">
          <Field label="Абонемент" required>
            <select value={tariffId || ""} onChange={(e) => setTariffId(Number(e.target.value) || 0)} className={fieldCtl} data-tariff-id={tariffId || undefined}>
              <option value="">{tariffOffers.length ? "выберите" : "нет абонементов в филиале"}</option>
              {tariffOffers.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Дата начала" required>
            <input type="date" value={tariffDate} onChange={(e) => setTariffDate(e.target.value)} className={fieldCtl} />
          </Field>
          {pickedTariff ? (
            <p className="pl-[8.6rem] text-[0.78rem] text-muted">
              {money(pickedTariff.price)}
              {pickedTariff.lessons ? ` · ${pickedTariff.lessons} ур.` : ""}
            </p>
          ) : null}
        </div>
        <footer className="flex items-center justify-end gap-2 border-t border-black/8 px-5 py-3">
          <button type="button" className="h-9 rounded-full px-4 text-sm font-semibold text-muted hover:bg-surface-2" onClick={() => setTariffOpen(false)}>
            Отмена
          </button>
          <Button
            type="button"
            size="sm"
            className="h-9"
            data-op="customerTariff"
            disabled={!onAction || Boolean(busy) || !tariffId}
            onClick={() => void run("customerTariff", { tariffId, date: tariffDate })}
          >
            {busy === "customerTariff" ? "Сохраняю…" : "Сохранить"}
          </Button>
        </footer>
      </div>
    </div>
  ) : null;
  const tariffNode = tariffDialog && typeof document !== "undefined" ? createPortal(tariffDialog, document.body) : tariffDialog;

  if (variant === "panel") {
    return (
      <>
        {article}
        {dialogNode}
        {tariffNode}
      </>
    );
  }
  const overlay = (
    <div className="fixed inset-0 z-[220] flex items-center justify-center bg-black/45 p-3 md:p-6" onClick={onClose}>
      {article}
    </div>
  );
  if (typeof document === "undefined") {
    return (
      <>
        {overlay}
        {dialog}
        {tariffDialog}
      </>
    );
  }
  return (
    <>
      {createPortal(overlay, document.body)}
      {dialogNode}
      {tariffNode}
    </>
  );
}
