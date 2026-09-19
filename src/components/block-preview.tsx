"use client";

import type { CSSProperties, ReactNode } from "react";
import { AGE_BANDS } from "@/data/ages";
import { YANDEX_RATING } from "@/data/reviews";
import { BRANCHES, SCHOOLS, SHOWCASE, STATS, TICKER } from "@/data/site";
import { cn } from "@/lib/utils";

const ART = "/media/home/shot-art.jpg";
const SCULPT = "/media/home/shot-sculpt.jpg";
const ROBOT = "/media/home/shot-robot.jpg";
const CODE = "/media/home/shot-code.jpg";
const SCIENCE = "/media/home/shot-science.jpg";
const MC = "/media/home/shot-mc.jpg";
const TEACHER = "/media/home/shot-teacher.jpg";
const FACE = ["/media/courses/team/01.jpg", "/media/courses/team/02.jpg", "/media/courses/team/03.jpg", "/media/courses/team/04.jpg"];
const SRC = 1280;

function Pic({ src, className, imgClass }: { src: string; className?: string; imgClass?: string }) {
  return (
    <span className={cn("block overflow-hidden", className)}>
      <img src={src} alt="" loading="lazy" decoding="async" className={cn("h-full w-full object-cover", imgClass)} />
    </span>
  );
}

function Mini({ h, w = SRC, children }: { h: number; w?: number; children: ReactNode }) {
  return (
    <div className="ve-mini" style={{ aspectRatio: `${w} / ${h}`, ["--ve-src-w"]: `${w}px` } as CSSProperties} aria-hidden>
      <div className="ve-mini-canvas pointer-events-none select-none" style={{ width: w, height: h }}>
        {children}
      </div>
    </div>
  );
}

function Btn({ children, ghost, dark }: { children: string; ghost?: boolean; dark?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex h-11 items-center rounded-full px-6 text-[0.95rem] font-semibold",
        ghost ? (dark ? "border border-white/25 text-header-fg" : "border border-border text-fg") : "bg-primary text-white",
      )}
    >
      {children}
    </span>
  );
}

function Collage({ shots }: { shots: [string, string, string] }) {
  return (
    <div className="relative">
      <div className="photo-stack">
        {shots.map((src) => (
          <div key={src} className="shot">
            <div className="shot-card bg-header">
              <img src={src} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Hero({ kicker, title, shots }: { kicker: string; title: string; shots: [string, string, string] }) {
  return (
    <section className="ink relative isolate h-full overflow-hidden text-header-fg">
      <div className="page-wrap grid h-full grid-cols-[1.05fr_0.95fr] items-center gap-8 py-8">
        <div className="relative z-10 max-w-xl">
          <p className="kicker text-header-fg/55">{kicker}</p>
          <h1 className="mt-5 text-[clamp(2.1rem,1.2rem+3vw,3.8rem)] leading-[1.05]">{title}</h1>
          <p className="mt-5 max-w-md text-[1.02rem] leading-relaxed text-header-fg/70">
            Семь школ: искусство, инженерия и IT в одной сети. Пробное занятие — чтобы выбрать направление вместе.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Btn>Пробное занятие</Btn>
            <Btn ghost dark>
              Смотреть курсы
            </Btn>
          </div>
          <div className="mt-10 grid grid-cols-4 gap-3 border-t border-white/10 pt-6">
            {STATS.map((s) => (
              <div key={s.label}>
                <p className="display text-2xl tabular-nums">{s.value}</p>
                <p className="mt-1 text-xs leading-snug text-header-fg/50">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
        <Collage shots={shots} />
      </div>
    </section>
  );
}

function Play({ src, className }: { src: string; className?: string }) {
  return (
    <div className={cn("relative overflow-hidden rounded-3xl bg-header", className)}>
      <img src={src} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
      <span className="absolute inset-0 grid place-items-center bg-black/15">
        <span className="grid size-14 place-items-center rounded-full bg-white/92">
          <span className="ml-1 size-0 border-y-[10px] border-l-[18px] border-y-transparent border-l-[#12141a]" />
        </span>
      </span>
    </div>
  );
}

function inner(typeId: string) {
  switch (typeId) {
    case "hero":
      return (
        <Mini h={640}>
          <Hero kicker="Сеть школ · Коломна · Луховицы" title="Ребёнок не просто учится — он мыслит, растёт и создаёт будущее" shots={[ART, SCULPT, ROBOT]} />
        </Mini>
      );
    case "course-hero":
      return (
        <Mini h={640}>
          <Hero kicker="Школа робототехники · 5–14 лет" title="Робототехника в Коломне" shots={[ROBOT, ART, CODE]} />
        </Mini>
      );
    case "ticker":
      return (
        <div className="ink overflow-hidden border-y border-white/10 py-3 text-header-fg" aria-hidden>
          <div className="flex items-center gap-6 overflow-hidden whitespace-nowrap px-4 text-sm font-medium text-header-fg/55">
            {TICKER.slice(0, 10).map((item) => (
              <span key={item} className="flex items-center gap-6">
                {item}
                <span className="size-1 rounded-full bg-primary" />
              </span>
            ))}
          </div>
        </div>
      );
    case "robot":
      return (
        <Mini h={420}>
          <div className="flex h-full items-center bg-bg px-8 py-8">
            <div className="grid h-full w-full grid-cols-[0.92fr_1.08fr] overflow-hidden rounded-[2rem] bg-ink text-header-fg shadow-[var(--shadow-border)]">
              <div className="flex flex-col justify-center px-10">
                <p className="kicker text-header-fg/50">Билингвальный курс</p>
                <h2 className="section-title mt-4 text-header-fg">Робототехника на английском</h2>
                <p className="mt-4 max-w-md text-[1.02rem] leading-relaxed text-header-fg/70">
                  Занятие ведёт носитель языка, рядом — педагог-переводчик.
                </p>
                <p className="mt-5 flex flex-wrap gap-2">
                  {["9–13 лет", "Носитель языка", "Код · схемы · 3D"].map((item) => (
                    <span key={item} className="rounded-full bg-white/10 px-3 py-1 text-[0.78rem] font-semibold">
                      {item}
                    </span>
                  ))}
                </p>
              </div>
              <div className="p-6">
                <Play src={ROBOT} className="h-full" />
              </div>
            </div>
          </div>
        </Mini>
      );
    case "video-grid":
    case "video":
      return (
        <Mini h={400}>
          <div className="flex h-full items-center bg-bg px-10 py-8">
            <Play src={typeId === "video" ? CODE : ROBOT} className="h-full w-full" />
          </div>
        </Mini>
      );
    case "ages":
      return (
        <Mini h={280}>
          <section className="page-wrap flex h-full flex-col justify-center py-8">
            <p className="kicker text-primary">Подбор за 10 секунд</p>
            <h2 className="section-title mt-3">Сколько лет ребёнку?</h2>
            <p className="mt-3 max-w-xl text-muted">Нажмите возраст — откроются курсы с ценой, филиалом и записью на пробное.</p>
            <div className="mt-5 flex flex-wrap gap-2">
              {AGE_BANDS.map((b, i) => (
                <span
                  key={b.id}
                  className={cn(
                    "inline-flex h-10 items-center rounded-full px-4 text-sm font-semibold",
                    i === 1 ? "bg-fg text-bg" : "bg-surface shadow-[var(--shadow-border)]",
                  )}
                >
                  {b.label}
                </span>
              ))}
            </div>
            <div className="mt-6">
              <Btn>Или оставить заявку сразу</Btn>
            </div>
          </section>
        </Mini>
      );
    case "schools":
      return (
        <Mini h={700}>
          <section className="page-wrap py-8">
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="kicker text-primary">Семь школ одной сети</p>
                <h2 className="section-title mt-3">Выберите направление</h2>
              </div>
              <Btn>Все курсы</Btn>
            </div>
            <div className="mt-8 grid grid-cols-4 grid-rows-2 gap-3" style={{ gridAutoRows: "minmax(11.5rem, auto)" }}>
              {SCHOOLS.slice(0, 5).map((s, i) => (
                <div
                  key={s.href}
                  className={cn(
                    "relative isolate min-h-56 overflow-hidden bg-header text-header-fg shadow-[var(--shadow-border)]",
                    i === 0 && "col-span-2 row-span-2 min-h-80",
                  )}
                >
                  <Pic src={s.image} className="absolute inset-0 h-full w-full" imgClass="h-full w-full object-cover" />
                  <div className="absolute inset-0 bg-gradient-to-t from-header via-header/25 to-transparent" />
                  <div className="relative flex h-full flex-col justify-end p-6">
                    <span className="w-fit rounded-full bg-white/15 px-2.5 py-1 text-[0.7rem] font-semibold">{s.kicker}</span>
                    <h3 className={cn("display mt-3 leading-tight", i === 0 ? "text-4xl" : "text-xl")}>{s.label}</h3>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </Mini>
      );
    case "catalog":
      return (
        <Mini h={560}>
          <section className="page-wrap py-8">
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="kicker text-primary">Каталог</p>
                <h2 className="section-title mt-3">Курсы сети «Развивайся»</h2>
              </div>
              <Btn>Открыть каталог</Btn>
            </div>
            <div className="mt-8 grid grid-cols-4 gap-4">
              {SHOWCASE.slice(0, 4).map((c) => (
                <div key={c.href} className="relative isolate overflow-hidden rounded-3xl bg-surface-2 text-header-fg shadow-[var(--shadow-border)]">
                  <Pic src={c.src} className="aspect-4/5" />
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 via-black/35 to-transparent px-4 pb-4 pt-28">
                    <p className="text-[0.78rem] font-semibold text-white/90">{c.age}</p>
                    <p className="display mt-1 text-[1.15rem] leading-tight text-white">{c.title}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </Mini>
      );
    case "related":
      return (
        <Mini h={420}>
          <div className="page-wrap py-8">
            <h2 className="display text-3xl">Курсы для детей 7–9 лет</h2>
            <ul className="mt-6 grid grid-cols-2 gap-4">
              {SHOWCASE.slice(2, 4).map((c) => (
                <li key={c.href} className="overflow-hidden rounded-2xl bg-surface shadow-[var(--shadow-border)]">
                  <Pic src={c.src} className="aspect-[16/10] bg-surface-2" />
                  <span className="block px-4 py-3">
                    <span className="block text-[0.98rem] font-semibold leading-snug">{c.title}</span>
                    <span className="mt-1 block text-xs text-muted">{c.age}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </Mini>
      );
    case "about":
    case "two-col":
    case "custom":
      return (
        <Mini h={440}>
          <section className="page-wrap flex h-full items-center py-8">
            <div className="grid w-full grid-cols-2 items-center gap-12 overflow-hidden rounded-[2rem] bg-surface p-10 shadow-[var(--shadow-border)]">
              <div>
                <p className="kicker text-primary">{typeId === "about" ? "О студии" : "Блок"}</p>
                <h2 className="section-title mt-3">{typeId === "about" ? "Это студия «Развивайся»" : "Заголовок блока"}</h2>
                <p className="mt-5 text-[0.98rem] leading-relaxed text-muted">
                  Семь школ: искусство, инженерия и IT в одной сети. Пробное занятие — чтобы выбрать направление вместе.
                </p>
              </div>
              <Pic src={typeId === "custom" ? SCIENCE : TEACHER} className="aspect-[4/3] overflow-hidden rounded-3xl bg-header" />
            </div>
          </section>
        </Mini>
      );
    case "teachers":
      return (
        <Mini h={520}>
          <section className="page-wrap py-8">
            <p className="kicker text-primary">Педагоги</p>
            <h2 className="section-title mt-3">Команда сильной сети школ</h2>
            <div className="mt-8 grid grid-cols-4 gap-4">
              {FACE.map((src) => (
                <div key={src} className="overflow-hidden rounded-[1.6rem] bg-surface shadow-[var(--shadow-border)]">
                  <Pic src={src} className="aspect-[4/5] bg-surface-2" imgClass="object-top" />
                  <div className="p-4">
                    <p className="display text-[1.05rem] leading-snug">Педагог студии</p>
                    <p className="mt-2 text-[0.86rem] text-muted">Коломна</p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </Mini>
      );
    case "reviews":
    case "page-reviews":
      return (
        <Mini h={320}>
          <section className="page-wrap flex h-full flex-col justify-center py-8">
            <p className="kicker text-primary">Отзывы родителей</p>
            <article className="mt-6 overflow-hidden rounded-[1.75rem] bg-surface shadow-[var(--shadow-border)]">
              <div className="grid grid-cols-[10.5rem_minmax(0,1fr)]">
                <div className="flex flex-col justify-center border-r border-border/70 px-6 py-6">
                  <p className="display text-6xl leading-none text-primary">{YANDEX_RATING.score}</p>
                  <p className="mt-2 text-xs text-muted">Яндекс · {YANDEX_RATING.ratings} оценок</p>
                </div>
                <div className="px-7 py-6">
                  <span className="rounded-full bg-primary/10 px-2.5 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-primary">
                    Художественная школа
                  </span>
                  <p className="display mt-3 max-w-3xl text-[1.65rem] leading-snug">
                    «Я очень благодарна студии «Развивайся»! Здесь я не только научилась рисовать, но и нашла друзей.»
                  </p>
                  <p className="mt-3 text-sm">
                    <span className="font-semibold">Софья Харламова</span>
                    <span className="text-muted"> · 4 июня 2025</span>
                  </p>
                </div>
              </div>
            </article>
          </section>
        </Mini>
      );
    case "stories":
      return (
        <Mini h={440}>
          <section className="page-wrap py-8">
            <p className="kicker text-primary">Жизнь студии</p>
            <h2 className="section-title mt-3">Проекты и события</h2>
            <div className="mt-8 grid grid-cols-3 gap-4">
              {[
                [MC, "Мастер-классы"],
                [ART, "Выставки"],
                [ROBOT, "Соревнования"],
              ].map(([src, title]) => (
                <div key={title} className="overflow-hidden rounded-3xl bg-surface shadow-[var(--shadow-border)]">
                  <Pic src={src} className="aspect-video" />
                  <div className="p-5">
                    <h3 className="display text-xl leading-snug">{title}</h3>
                    <p className="mt-4 text-sm font-semibold text-primary">Смотреть →</p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </Mini>
      );
    case "branches":
      return (
        <Mini h={420}>
          <section className="ink h-full overflow-hidden py-12 text-header-fg">
            <div className="page-wrap">
              <p className="kicker text-header-fg/45">Три студии</p>
              <h2 className="section-title mt-3">Сеть в Коломне и Луховицах</h2>
              <div className="mt-10 grid grid-cols-3 gap-4">
                {BRANCHES.map((b) => (
                  <div key={b.address} className="rounded-3xl bg-white/5 p-7 ring-1 ring-white/10">
                    <p className="kicker text-header-fg/45">{b.city}</p>
                    <p className="display mt-3 text-2xl">{b.name}</p>
                    <p className="mt-3 text-sm text-header-fg/75">{b.address}</p>
                    <p className="mt-2 text-sm text-header-fg/50">{b.hours}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </Mini>
      );
    case "trial":
    case "trial-form":
      return (
        <Mini h={360}>
          <section className="page-wrap flex h-full items-center py-8">
            <div className="w-full rounded-[1.75rem] bg-surface px-10 py-10 shadow-[var(--shadow-border)]">
              <p className="kicker text-primary">Пробное занятие</p>
              <h2 className="display mt-3 max-w-lg text-4xl">Приведите ребёнка на первое занятие</h2>
              <p className="mt-4 max-w-lg text-[0.98rem] leading-relaxed text-muted">
                Без абонемента. После урока решите, продолжать ли.
              </p>
              <span className="mt-6 inline-flex h-11 items-center rounded-full bg-primary px-6 text-[0.95rem] font-semibold text-white">
                Записаться на пробное
              </span>
            </div>
          </section>
        </Mini>
      );
    case "buttons":
      return (
        <div className="flex items-center bg-bg px-5 py-5" aria-hidden>
          <span className="inline-flex h-11 items-center rounded-full bg-primary px-6 text-[0.95rem] font-semibold text-white">
            Пробное занятие
          </span>
        </div>
      );
    case "convert-band":
      return (
        <Mini h={260}>
          <section className="page-wrap flex h-full items-center py-6">
            <div className="w-full overflow-hidden rounded-3xl bg-surface shadow-[var(--shadow-border)]">
              <div className="px-6 py-3.5">
                <p className="kicker text-primary">Ближайшие группы</p>
                <h2 className="display mt-1 text-2xl">Прийти на этой неделе</h2>
              </div>
              <ul className="grid grid-cols-3 border-t border-border/70">
                {[
                  ["Коломна", "Ср 16:00", "Робототехника 7–9"],
                  ["Коломна", "Чт 17:30", "Робототехника 10–14"],
                  ["Луховицы", "Сб 11:00", "Робототехника 5–6"],
                ].map(([city, when, group], i) => (
                  <li key={when} className={cn("flex items-center justify-between gap-3 px-6 py-3.5", i && "border-l border-border/70")}>
                    <span>
                      <span className="text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-muted">{city}</span>
                      <span className="display mt-0.5 block text-[1.15rem] leading-none">{when}</span>
                      <span className="mt-1 block text-xs text-muted">{group}</span>
                    </span>
                    <span className="shrink-0 rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-white">Запись на пробное</span>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        </Mini>
      );
    case "convert-aside":
      return (
        <Mini h={380}>
          <div className="flex h-full items-center justify-center bg-bg px-8">
            <aside className="w-[22rem] rounded-[1.75rem] bg-surface p-5 shadow-[var(--shadow-border)]">
              <p className="kicker text-primary">Запись</p>
              <p className="display mt-2 text-2xl">Группа</p>
              <div className="mt-3 rounded-2xl bg-bg px-3.5 py-3">
                <p className="font-semibold leading-snug">Робототехника 7–9</p>
                <p className="mt-1 text-sm text-muted">Ср 16:00 · Коломна</p>
              </div>
              <span className="mt-5 flex h-11 items-center justify-center rounded-full bg-primary text-[0.95rem] font-semibold text-white">
                Записаться на пробное
              </span>
            </aside>
          </div>
        </Mini>
      );
    case "course-story":
    case "heading":
    case "rich-text":
      return (
        <Mini h={280}>
          <section className="page-wrap flex h-full flex-col justify-center py-8">
            {typeId !== "heading" ? <p className="kicker">О курсе</p> : null}
            <h2 className="display section-title mt-3 max-w-3xl">
              {typeId === "heading" ? "Заголовок блока" : "Ребёнок собирает, программирует и думает руками"}
            </h2>
            {typeId !== "heading" ? (
              <p className="mt-5 max-w-3xl text-[1.02rem] leading-relaxed text-fg/80">
                На пробном покажем, как проходит занятие: схема, сборка, код. Без абонемента — после урока решите сами.
              </p>
            ) : null}
          </section>
        </Mini>
      );
    case "why":
    case "sell-why":
      return (
        <Mini h={360}>
          <section className="page-wrap py-8">
            <h2 className="display section-title max-w-3xl">
              {typeId === "sell-why" ? "Через 3 месяца ребёнок умеет" : "Что получит ребёнок — и зачем это сейчас"}
            </h2>
            <div className="mt-6 grid grid-cols-3 gap-3">
              {["Собирает схему сам", "Пишет простой код", "Показывает родителям"].map((t, i) => (
                <article key={t} className="rounded-2xl bg-surface p-6 shadow-[var(--shadow-border)]">
                  <p className="display text-[1.65rem] leading-none text-primary/35">0{i + 1}</p>
                  <h3 className="display mt-3 text-xl leading-snug">{t}</h3>
                </article>
              ))}
            </div>
          </section>
        </Mini>
      );
    case "program":
      return (
        <Mini h={360}>
          <section className="page-wrap py-8">
            <p className="kicker">Программа</p>
            <h2 className="display section-title mt-2">Что внутри — по шагам</h2>
            <div className="mt-6 overflow-hidden rounded-2xl bg-surface shadow-[var(--shadow-border)]">
              {["Знакомство с набором", "Сборка и схема", "Код и запуск"].map((t, i) => (
                <div key={t} className={cn("flex items-center justify-between px-6 py-4", i && "border-t border-border/70")}>
                  <span className="display text-lg">{t}</span>
                  <span className="text-muted">{i === 0 ? "–" : "+"}</span>
                </div>
              ))}
            </div>
          </section>
        </Mini>
      );
    case "gallery":
      return (
        <Mini h={340}>
          <section className="page-wrap py-8">
            <div className="grid h-full grid-cols-3 gap-3">
              {[ART, SCULPT, ROBOT].map((src) => (
                <Pic key={src} src={src} className="h-full overflow-hidden rounded-3xl" />
              ))}
            </div>
          </section>
        </Mini>
      );
    case "image":
      return (
        <Mini h={380}>
          <section className="page-wrap flex h-full items-center py-8">
            <Pic src={ART} className="aspect-[4/3] w-full overflow-hidden rounded-3xl" />
          </section>
        </Mini>
      );
    case "school-courses":
      return (
        <Mini h={360}>
          <div className="page-wrap py-8">
            <h2 className="display text-2xl">Программы этого направления</h2>
            <ul className="mt-5 overflow-hidden rounded-[1.35rem] bg-surface shadow-[var(--shadow-border)]">
              {SHOWCASE.slice(0, 3).map((c, i) => (
                <li key={c.href} className={cn("flex items-center gap-4 p-3 pr-4", i && "border-t border-border/70")}>
                  <Pic src={c.src} className="size-[5.35rem] shrink-0 overflow-hidden rounded-[1.05rem] bg-surface-2" />
                  <span className="min-w-0 flex-1">
                    <span className="inline-flex rounded-full bg-primary/10 px-2.5 py-1 text-[0.86rem] font-semibold text-primary">{c.age}</span>
                    <span className="display mt-1 block text-[1.32rem] leading-[1.2]">{c.title}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </Mini>
      );
    case "trajectory":
      return (
        <Mini h={400}>
          <section className="page-wrap py-8">
            <p className="kicker">Траектория</p>
            <h2 className="display mt-2 text-3xl">Ребёнок последовательно проходит путь</h2>
            <div className="mt-8 grid grid-cols-3 gap-4">
              {[
                [ROBOT, "5–6 лет"],
                [CODE, "7–9 лет"],
                [SCIENCE, "10–14 лет"],
              ].map(([src, t]) => (
                <div key={t} className="overflow-hidden rounded-2xl bg-surface shadow-[var(--shadow-border)]">
                  <Pic src={src} className="aspect-[16/10]" />
                  <p className="px-4 py-3 display text-lg">{t}</p>
                </div>
              ))}
            </div>
          </section>
        </Mini>
      );
    case "schedule":
      return (
        <Mini h={360}>
          <section className="page-wrap py-8">
            <p className="kicker">Расписание</p>
            <h2 className="display mt-2 text-2xl">Группы этого курса</h2>
            <div className="mt-4 flex flex-wrap gap-2">
              {["Все города", "Коломна", "Луховицы"].map((t, i) => (
                <span
                  key={t}
                  className={cn(
                    "inline-flex h-10 items-center rounded-full px-4 text-sm font-semibold",
                    i === 0 ? "bg-fg text-bg" : "bg-surface shadow-[var(--shadow-border)]",
                  )}
                >
                  {t}
                </span>
              ))}
            </div>
            <div className="mt-5 overflow-hidden rounded-2xl bg-surface shadow-[var(--shadow-border)]">
              {["Ср 16:00 · Робототехника 7–9 · Коломна", "Чт 17:30 · Робототехника 10–14 · Коломна", "Сб 11:00 · Робототехника 5–6 · Луховицы"].map(
                (t, i) => (
                  <div key={t} className={cn("px-6 py-3.5 text-[0.98rem] font-semibold", i && "border-t border-border/70")}>
                    {t}
                  </div>
                ),
              )}
            </div>
          </section>
        </Mini>
      );
    case "sell-program":
      return (
        <Mini h={320}>
          <section className="page-wrap py-8">
            <p className="kicker">Педагог курса</p>
            <h2 className="display section-title mt-2">Кто ведёт — и кому доверяют родители</h2>
            <div className="mt-6 flex gap-4 overflow-hidden rounded-2xl bg-surface p-4 shadow-[var(--shadow-border)]">
              <Pic src={FACE[0]} className="size-28 shrink-0 overflow-hidden rounded-xl bg-surface-2" imgClass="object-top" />
              <span className="py-1">
                <span className="display block text-xl leading-snug">Педагог студии</span>
                <span className="mt-2 block text-sm leading-relaxed text-muted">Ведёт группу и помогает выбрать направление.</span>
                <span className="mt-3 inline-block text-sm font-semibold text-primary">О педагоге →</span>
              </span>
            </div>
          </section>
        </Mini>
      );
    default:
      return (
        <Mini h={640}>
          <Hero kicker="Сеть школ" title="Развивайся" shots={[ART, SCULPT, ROBOT]} />
        </Mini>
      );
  }
}

export function BlockPreview({ typeId }: { typeId: string }) {
  return inner(typeId);
}
