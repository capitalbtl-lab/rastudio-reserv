"use client";

import { useState, type FormEvent } from "react";
import type { CmsSession } from "@/data/cms";
import { sendTrial, TRIAL_BRANCHES, trialCourseForPath } from "@/data/trial";
import { SITE_BRANCHES } from "@/data/site-signup-core";
import { freePlaces, formatTrialDate, isoDate, nextLessonDate, tidyGroupName, whenShort } from "@/lib/trial-slot";
import { Button } from "@/components/ui/button";

const field =
  "mt-1 h-9 w-full min-w-0 rounded-[8px] bg-bg px-3 text-sm shadow-[var(--shadow-border)] outline-none focus:ring-2 focus:ring-primary/30";
const label = "text-[0.68rem] font-semibold uppercase tracking-wider text-muted";

export function TrialModal({
  session,
  path = "",
  mode = "trial",
  onClose,
}: {
  session: CmsSession;
  path?: string;
  mode?: "trial" | "group";
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
          kind: mode,
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
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center overflow-hidden bg-black/40 p-2 sm:p-4"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-lg overflow-hidden rounded-[1.25rem] bg-surface px-4 py-3.5 shadow-2xl sm:px-5 sm:py-4"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          aria-label="Закрыть"
          onClick={onClose}
          className="absolute right-2.5 top-2.5 grid h-8 w-8 place-items-center rounded-full text-lg leading-none text-muted hover:bg-black/5 hover:text-fg"
        >
          ×
        </button>
        <p className="kicker pr-8 text-primary">{mode === "group" ? "Группа" : "Пробное занятие"}</p>
        <h2 className="display mt-0.5 pr-8 text-xl sm:text-[1.35rem]">
          {mode === "group" ? "Запись в группу" : "Запись на пробное"}
        </h2>
        <div className="mt-2.5 rounded-[10px] bg-bg px-3 py-2 text-[0.82rem] leading-snug">
          <p className="font-semibold">{tidyGroupName(session.group)}</p>
          <p className="mt-0.5 text-muted">
            {whenShort(session)}
            {session.teacher ? ` · ${session.teacher}` : ""}
            {session.level ? ` · ${session.level}` : ""}
          </p>
          <p className="text-muted">
            {branchLabel}
            {seats.label ? ` · ${seats.label}` : ""}
            {next ? ` · ${formatTrialDate(next)}` : ""}
          </p>
        </div>
        {done ? (
          <p className="mt-3 text-sm">Заявку приняли. Напишем в течение 15 минут.</p>
        ) : (
          <form onSubmit={onSubmit} className="mt-3 grid gap-2">
            <label>
              <span className={label}>ФИО родителя</span>
              <input name="parent" required autoComplete="name" className={field} />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label>
                <span className={label}>ФИО ребёнка</span>
                <input name="child" required className={field} />
              </label>
              <label>
                <span className={label}>Дата рождения</span>
                <input name="dob" type="date" required className={field} />
              </label>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <label>
                <span className={label}>Телефон</span>
                <input name="phone" type="tel" required autoComplete="tel" className={field} />
              </label>
              <label>
                <span className={label}>Почта</span>
                <input name="email" type="email" autoComplete="email" className={field} />
              </label>
            </div>
            <input type="hidden" name="branch" value={branchId} />
            {error ? <p className="text-sm text-red-600">{error}</p> : null}
            <Button type="submit" className="mt-1 h-10 w-full" disabled={pending}>
              {pending ? "Отправляем…" : mode === "group" ? "Записать в группу" : "Отправить заявку"}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
