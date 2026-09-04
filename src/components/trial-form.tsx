"use client";

import { useState, type FormEvent } from "react";
import { SITE } from "@/data/site";
import { sendTrial, TRIAL_BRANCHES, TRIAL_COURSES } from "@/data/trial";
import { Button } from "@/components/ui/button";

const fieldClass =
  "mt-1.5 h-11 w-full rounded-xl bg-bg px-3.5 text-sm shadow-[var(--shadow-border)] outline-none transition-shadow focus:shadow-[var(--shadow-border-hover)] focus:ring-2 focus:ring-primary/30";

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-muted">{label}</span>
      {children}
    </label>
  );
}

export function TrialForm({
  compact = false,
  courseId = "",
  branchId = "",
}: {
  compact?: boolean;
  courseId?: string;
  branchId?: string;
}) {
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setPending(true);
    const form = new FormData(e.currentTarget);
    const payload = {
      parent: String(form.get("parent") || ""),
      child: String(form.get("child") || ""),
      dob: String(form.get("dob") || ""),
      phone: String(form.get("phone") || ""),
      email: String(form.get("email") || ""),
      course: String(form.get("course") || ""),
      branch: String(form.get("branch") || ""),
    };
    try {
      const res = await sendTrial({ data: payload });
      if (res.ok) setDone(true);
      else setError(res.error);
    } catch {
      setError("Не удалось отправить. Позвоните нам.");
    } finally {
      setPending(false);
    }
  }

  return (
    <section id={compact ? undefined : "trial"} className="overflow-hidden rounded-[1.75rem] bg-surface px-5 py-8 shadow-[var(--shadow-border)] md:px-10 md:py-11">
      <div className={`grid gap-8 ${compact ? "" : "lg:grid-cols-[0.9fr_1.1fr] lg:items-start"}`}>
        <div>
          <p className="kicker text-primary">Пробное занятие</p>
          <h2 className="display mt-3 max-w-md text-3xl md:text-4xl">Приведите ребёнка на первое занятие</h2>
          <p className="mt-4 max-w-md text-[0.98rem] leading-relaxed text-muted">
            Пробное занятие. Решите после урока — заранее ничего не оформляем. Телефон{" "}
            <a className="font-semibold text-fg" href={SITE.phoneHref}>
              {SITE.phone}
            </a>
            .
          </p>
        </div>

        {done ? (
          <div className="rounded-2xl bg-bg px-5 py-8">
            <p className="display text-2xl">Заявка у администратора</p>
            <p className="mt-3 text-muted">
              Напишем в течение 15 минут и подберём филиал и время. Если удобнее сейчас — позвоните или напишите.
            </p>
            <p className="mt-5 flex flex-wrap gap-4 text-sm font-semibold">
              <a href={SITE.phoneHref}>{SITE.phone}</a>
              <a href={SITE.telegram} target="_blank" rel="noreferrer">
                Telegram
              </a>
            </p>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-2">
            <Field label="ФИО родителя *">
              <input name="parent" required autoComplete="name" className={fieldClass} />
            </Field>
            <Field label="ФИО ребёнка *">
              <input name="child" required className={fieldClass} />
            </Field>
            <Field label="Дата рождения *">
              <input name="dob" type="date" required className={fieldClass} />
            </Field>
            <Field label="Телефон *">
              <input name="phone" type="tel" required autoComplete="tel" inputMode="tel" className={fieldClass} />
            </Field>
            <Field label="Электронная почта *">
              <input name="email" type="email" required autoComplete="email" className={`${fieldClass} sm:col-span-1`} />
            </Field>
            <Field label="Филиал *">
              <select name="branch" required defaultValue={branchId} className={fieldClass}>
                <option value="" disabled>
                  Выберите филиал
                </option>
                {TRIAL_BRANCHES.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </Field>
            <div className="sm:col-span-2">
              <Field label="Курс">
                <select name="course" defaultValue={courseId} className={fieldClass}>
                  <option value="">Помочь выбрать</option>
                  {TRIAL_COURSES.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            {error ? <p className="sm:col-span-2 text-sm text-red-600">{error}</p> : null}
            <div className="sm:col-span-2 pt-1">
              <Button type="submit" size="lg" disabled={pending}>
                {pending ? "Отправляем…" : "Отправить заявку"}
              </Button>
            </div>
          </form>
        )}
      </div>
    </section>
  );
}
