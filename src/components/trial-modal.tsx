"use client";

import { useState, type FormEvent } from "react";
import type { CmsSession } from "@/data/cms";
import { sendTrial, TRIAL_BRANCHES } from "@/data/trial";
import { trialCourseForPath } from "@/data/trial";
import { SITE_BRANCHES } from "@/data/site-signup-core";
import { freePlaces, formatTrialDate, isoDate, nextLessonDate, tidyGroupName, whenShort } from "@/lib/trial-slot";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const field =
  "mt-1.5 h-11 w-full rounded-xl bg-bg px-3.5 text-sm shadow-[var(--shadow-border)] outline-none focus:ring-2 focus:ring-primary/30";

export function TrialModal({
  session,
  path = "",
  onClose,
}: {
  session: CmsSession;
  path?: string;
  onClose: () => void;
}) {
  const next = nextLessonDate(session);
  const seats = freePlaces(session);
  const branchId = String(session.branchId || 2);
  const branchLabel =
    SITE_BRANCHES.find((b) => String(b.id) === branchId)?.label ||
    TRIAL_BRANCHES.find((b) => b.id === branchId)?.name ||
    session.branch;
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setPending(true);
    const form = new FormData(e.currentTarget);
    try {
      const res = await sendTrial({
        data: {
          parent: String(form.get("parent") || ""),
          child: String(form.get("child") || ""),
          dob: String(form.get("dob") || ""),
          phone: String(form.get("phone") || ""),
          email: String(form.get("email") || ""),
          course: session.courseId || trialCourseForPath(path),
          branch: branchId,
          gid: String(session.groupId || ""),
          groupName: session.group,
          date: next ? isoDate(next) : "",
          time: session.timeFrom || "",
          kind: "trial",
        },
      });
      if (res.ok) setDone(true);
      else setError(res.error || "Не отправилось.");
    } catch {
      setError("Не удалось отправить. Позвоните нам.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/40 p-3 sm:items-center" onClick={onClose}>
      <div
        className="max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-[1.6rem] bg-surface p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="kicker text-primary">Пробное занятие</p>
        <h2 className="display mt-1 text-2xl">Запись на пробное</h2>
        <div className="mt-3 rounded-2xl bg-bg px-3.5 py-3 text-sm">
          <p className="font-semibold">{tidyGroupName(session.group)}</p>
          <p className="mt-1 text-muted">
            {whenShort(session)}
            {session.teacher ? ` · ${session.teacher}` : ""}
          </p>
          {session.level ? <p className="mt-0.5 text-muted">Уровень: {session.level}</p> : null}
          <p className="mt-0.5 text-muted">
            {branchLabel}
            {seats.label ? ` · ${seats.label}` : ""}
            {next ? ` · ${formatTrialDate(next)}` : ""}
          </p>
        </div>
        {done ? (
          <p className="mt-4 text-sm">Заявку приняли. Напишем в течение 15 минут.</p>
        ) : (
          <form onSubmit={onSubmit} className="mt-4 grid gap-3">
            <label>
              <span className="text-[0.7rem] font-semibold uppercase tracking-wider text-muted">ФИО родителя</span>
              <input name="parent" required autoComplete="name" className={field} />
            </label>
            <label>
              <span className="text-[0.7rem] font-semibold uppercase tracking-wider text-muted">ФИО ребёнка</span>
              <input name="child" required className={field} />
            </label>
            <label>
              <span className="text-[0.7rem] font-semibold uppercase tracking-wider text-muted">Дата рождения</span>
              <input name="dob" type="date" required className={field} />
            </label>
            <label>
              <span className="text-[0.7rem] font-semibold uppercase tracking-wider text-muted">Телефон</span>
              <input name="phone" type="tel" required autoComplete="tel" className={field} />
            </label>
            <label>
              <span className="text-[0.7rem] font-semibold uppercase tracking-wider text-muted">Почта</span>
              <input name="email" type="email" autoComplete="email" className={field} />
            </label>
            <label>
              <span className="text-[0.7rem] font-semibold uppercase tracking-wider text-muted">Филиал</span>
              <input readOnly value={branchLabel} className={cn(field, "bg-white text-fg")} />
            </label>
            {error ? <p className="text-sm text-red-600">{error}</p> : null}
            <div className="mt-1 flex gap-2">
              <Button type="submit" className="flex-1" disabled={pending}>
                {pending ? "Отправляем…" : "Отправить заявку"}
              </Button>
              <Button type="button" variant="secondary" onClick={onClose}>
                Закрыть
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
