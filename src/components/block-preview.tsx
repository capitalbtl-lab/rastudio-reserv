"use client";

import type { ReactNode } from "react";
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

function Pic({ src, className }: { src: string; className?: string }) {
  return <img src={src} alt="" loading="lazy" decoding="async" className={cn("h-full w-full object-cover", className)} />;
}

function Kicker({ children, dark }: { children: string; dark?: boolean }) {
  return (
    <p className={cn("text-[5.5px] font-semibold uppercase tracking-[0.16em]", dark ? "text-white/45" : "text-primary")}>
      {children}
    </p>
  );
}

function Tit({ children, dark, className }: { children: string; dark?: boolean; className?: string }) {
  return (
    <p className={cn("font-semibold leading-[1.08] tracking-tight", dark ? "text-white" : "text-[#12141a]", className)}>
      {children}
    </p>
  );
}

function Cta({ children, ghost, dark }: { children: string; ghost?: boolean; dark?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex h-[11px] items-center rounded-full px-1.5 text-[6px] font-semibold leading-none",
        ghost
          ? dark
            ? "border border-white/25 text-white"
            : "border border-black/15 text-[#12141a]"
          : "bg-primary text-white",
      )}
    >
      {children}
    </span>
  );
}

function Page({ children, dark }: { children: ReactNode; dark?: boolean }) {
  return (
    <div className={cn("flex h-full flex-col px-2.5 py-2", dark ? "bg-[#090c12] text-[#f4f5f7]" : "bg-[#f5f6f8] text-[#12141a]")}>
      {children}
    </div>
  );
}

function Polaroids({ shots }: { shots: [string, string, string] }) {
  return (
    <div className="relative h-full min-h-0 w-full">
      <div className="absolute left-[2%] top-[4%] z-[1] aspect-[4/5] w-[56%] rotate-[-7deg] overflow-hidden rounded-lg shadow-[0_10px_18px_-8px_rgba(0,0,0,.65)]">
        <Pic src={shots[0]} />
      </div>
      <div className="absolute right-0 top-[10%] z-[2] aspect-[4/5] w-[50%] rotate-[6deg] overflow-hidden rounded-lg shadow-[0_10px_18px_-8px_rgba(0,0,0,.65)]">
        <Pic src={shots[1]} />
      </div>
      <div className="absolute bottom-[2%] left-[16%] z-[3] aspect-[5/4] w-[62%] rotate-[-2.5deg] overflow-hidden rounded-lg shadow-[0_10px_18px_-8px_rgba(0,0,0,.65)]">
        <Pic src={shots[2]} />
      </div>
    </div>
  );
}

function Hero({ title, kicker, shots }: { title: string; kicker: string; shots: [string, string, string] }) {
  return (
    <div
      className="flex h-full bg-[#090c12]"
      style={{
        background:
          "radial-gradient(90% 80% at 8% -20%, rgba(32,94,220,.28), transparent 52%), #090c12",
      }}
    >
      <div className="flex w-[46%] flex-col justify-center px-2.5 py-2">
        <Kicker dark>{kicker}</Kicker>
        <Tit dark className="mt-1 text-[10px]">
          {title}
        </Tit>
        <p className="mt-1 line-clamp-2 text-[6.5px] leading-snug text-white/55">
          Семь школ: искусство, инженерия и IT. Пробное — чтобы выбрать направление.
        </p>
        <div className="mt-1.5 flex gap-1">
          <Cta>Пробное занятие</Cta>
          <Cta ghost dark>
            Смотреть курсы
          </Cta>
        </div>
        <div className="mt-2 grid grid-cols-4 gap-1 border-t border-white/10 pt-1.5">
          {STATS.map((s) => (
            <div key={s.label}>
              <p className="text-[8px] font-semibold leading-none text-white">{s.value}</p>
              <p className="mt-0.5 text-[5px] leading-tight text-white/45">{s.label}</p>
            </div>
          ))}
        </div>
      </div>
      <div className="min-w-0 flex-1 pr-1">
        <Polaroids shots={shots} />
      </div>
    </div>
  );
}

function CourseCard({ src, title, age }: { src: string; title: string; age: string }) {
  return (
    <div className="relative min-h-0 overflow-hidden rounded-xl bg-[#eceef2]">
      <Pic src={src} />
      <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/35 to-transparent px-1.5 pb-1.5 pt-6">
        <span className="block text-[5.5px] font-semibold text-white/85">{age}</span>
        <span className="block text-[7.5px] font-semibold leading-tight text-white">{title}</span>
      </span>
    </div>
  );
}

function SchoolCard({ src, label, kicker, feature }: { src: string; label: string; kicker: string; feature?: boolean }) {
  return (
    <div className={cn("relative min-h-0 overflow-hidden bg-[#090c12]", feature && "row-span-2")}>
      <Pic src={src} />
      <span className="absolute inset-0 bg-gradient-to-t from-[#090c12] via-[#090c12]/25 to-transparent" />
      <span className="absolute inset-x-0 bottom-0 p-1.5">
        <span className="rounded-full bg-white/15 px-1 py-px text-[5px] font-semibold text-white/90">{kicker}</span>
        <span className={cn("mt-0.5 block font-semibold leading-tight text-white", feature ? "text-[9px]" : "text-[7px]")}>
          {label}
        </span>
      </span>
    </div>
  );
}

function VideoStill({ src }: { src: string }) {
  return (
    <div className="relative min-h-0 overflow-hidden rounded-xl bg-black">
      <Pic src={src} />
      <span className="absolute inset-0 grid place-items-center bg-black/15">
        <span className="grid size-6 place-items-center rounded-full bg-white/90">
          <span className="ml-0.5 size-0 border-y-[4px] border-l-[7px] border-y-transparent border-l-black/80" />
        </span>
      </span>
    </div>
  );
}

function inner(typeId: string) {
  switch (typeId) {
    case "hero":
      return <Hero kicker="Сеть школ · Коломна · Луховицы" title="Ребёнок не просто учится — он мыслит" shots={[ART, SCULPT, ROBOT]} />;
    case "course-hero":
      return <Hero kicker="Школа робототехники" title="Робототехника в Коломне" shots={[ROBOT, ART, CODE]} />;
    case "ticker":
      return (
        <div className="flex h-full items-center overflow-hidden bg-[#090c12]">
          <div className="flex items-center gap-2 whitespace-nowrap px-2">
            {TICKER.slice(0, 8).map((item) => (
              <span key={item} className="flex items-center gap-2 text-[8px] font-medium text-white/55">
                {item}
                <span className="size-1 rounded-full bg-primary" />
              </span>
            ))}
          </div>
        </div>
      );
    case "robot":
      return (
        <Page>
          <div className="grid min-h-0 flex-1 grid-cols-2 overflow-hidden rounded-2xl bg-[#12141a] text-white">
            <div className="flex flex-col justify-center px-2.5 py-2">
              <Kicker dark>Билингвальный курс</Kicker>
              <Tit dark className="mt-1 text-[10px]">
                Робототехника на английском
              </Tit>
              <div className="mt-1.5 flex flex-wrap gap-0.5">
                {["9–13 лет", "Носитель языка", "Код · схемы"].map((f) => (
                  <span key={f} className="rounded-full bg-white/10 px-1 py-px text-[5.5px] font-semibold text-white/85">
                    {f}
                  </span>
                ))}
              </div>
            </div>
            <div className="p-1.5">
              <VideoStill src={ROBOT} />
            </div>
          </div>
        </Page>
      );
    case "video-grid":
    case "video":
      return (
        <Page>
          <VideoStill src={typeId === "video" ? CODE : ROBOT} />
        </Page>
      );
    case "ages":
      return (
        <Page>
          <Kicker>Подбор за 10 секунд</Kicker>
          <Tit className="mt-1 text-[12px]">Сколько лет ребёнку?</Tit>
          <p className="mt-0.5 text-[6.5px] text-[#5e6470]">Нажмите возраст — откроются курсы.</p>
          <div className="mt-2 flex flex-wrap gap-1">
            {AGE_BANDS.map((b, i) => (
              <span
                key={b.id}
                className={cn(
                  "inline-flex h-[14px] items-center rounded-full px-1.5 text-[6.5px] font-semibold",
                  i === 1 ? "bg-[#12141a] text-white" : "bg-white shadow-[0_0_0_1px_rgba(18,20,26,.06)]",
                )}
              >
                {b.label}
              </span>
            ))}
          </div>
          <div className="mt-2">
            <Cta>Или оставить заявку сразу</Cta>
          </div>
        </Page>
      );
    case "schools":
      return (
        <Page>
          <Kicker>Семь школ одной сети</Kicker>
          <div className="mt-0.5 flex items-end justify-between">
            <Tit className="text-[11px]">Выберите направление</Tit>
            <Cta>Все курсы</Cta>
          </div>
          <div className="mt-1.5 grid min-h-0 flex-1 grid-cols-4 grid-rows-2 gap-1">
            {SCHOOLS.slice(0, 5).map((s, i) => (
              <SchoolCard key={s.href} src={s.image} label={s.label} kicker={s.kicker} feature={i === 0} />
            ))}
          </div>
        </Page>
      );
    case "catalog":
      return (
        <Page>
          <Kicker>Каталог</Kicker>
          <div className="mt-0.5 flex items-end justify-between">
            <Tit className="text-[11px]">Курсы сети «Развивайся»</Tit>
            <Cta>Открыть каталог</Cta>
          </div>
          <div className="mt-1.5 grid min-h-0 flex-1 grid-cols-4 gap-1">
            {SHOWCASE.slice(0, 4).map((c) => (
              <CourseCard key={c.href} src={c.src} title={c.title} age={c.age} />
            ))}
          </div>
        </Page>
      );
    case "related":
      return (
        <Page>
          <Tit className="text-[11px]">Курсы для детей 7–9 лет</Tit>
          <div className="mt-1.5 grid min-h-0 flex-1 grid-cols-2 gap-1.5">
            {SHOWCASE.slice(2, 4).map((c) => (
              <div key={c.href} className="flex min-h-0 flex-col overflow-hidden rounded-xl bg-white shadow-[0_0_0_1px_rgba(18,20,26,.06)]">
                <div className="min-h-0 flex-1 overflow-hidden">
                  <Pic src={c.src} />
                </div>
                <span className="px-1.5 py-1 text-[7px] font-semibold leading-tight">{c.title}</span>
              </div>
            ))}
          </div>
        </Page>
      );
    case "about":
    case "two-col":
    case "custom":
      return (
        <Page>
          <div className="grid min-h-0 flex-1 grid-cols-2 items-center gap-2 overflow-hidden rounded-2xl bg-white p-2 shadow-[0_0_0_1px_rgba(18,20,26,.06)]">
            <div>
              <Kicker>{typeId === "about" ? "О студии" : "Блок"}</Kicker>
              <Tit className="mt-1 text-[11px]">{typeId === "about" ? "Это студия «Развивайся»" : "Заголовок блока"}</Tit>
              <p className="mt-1 line-clamp-3 text-[6.5px] leading-snug text-[#5e6470]">
                Семь школ: искусство, инженерия и IT в одной сети. Пробное занятие — чтобы выбрать направление вместе.
              </p>
            </div>
            <div className="min-h-0 overflow-hidden rounded-xl bg-[#090c12]">
              <Pic src={typeId === "custom" ? SCIENCE : TEACHER} />
            </div>
          </div>
        </Page>
      );
    case "teachers":
      return (
        <Page>
          <Kicker>Педагоги</Kicker>
          <Tit className="mt-0.5 text-[11px]">Команда сильной сети школ</Tit>
          <div className="mt-1.5 grid min-h-0 flex-1 grid-cols-4 gap-1">
            {FACE.map((src) => (
              <div key={src} className="flex min-h-0 flex-col overflow-hidden rounded-xl bg-white shadow-[0_0_0_1px_rgba(18,20,26,.06)]">
                <div className="min-h-0 flex-1 overflow-hidden">
                  <Pic src={src} className="object-top" />
                </div>
                <span className="px-1 py-1">
                  <span className="block h-1.5 w-[80%] rounded-sm bg-[#12141a]/80" />
                  <span className="mt-0.5 block h-1 w-[55%] rounded-sm bg-black/20" />
                </span>
              </div>
            ))}
          </div>
        </Page>
      );
    case "reviews":
    case "page-reviews":
      return (
        <Page>
          <Kicker>Отзывы родителей</Kicker>
          <div className="mt-1.5 grid min-h-0 flex-1 grid-cols-[4.5rem_minmax(0,1fr)] overflow-hidden rounded-2xl bg-white shadow-[0_0_0_1px_rgba(18,20,26,.06)]">
            <div className="flex flex-col justify-center border-r border-black/[0.06] px-2">
              <p className="text-[18px] font-semibold leading-none text-primary">{YANDEX_RATING.score}</p>
              <p className="mt-1 text-[5.5px] leading-tight text-[#5e6470]">Яндекс · {YANDEX_RATING.ratings} оценок</p>
            </div>
            <div className="flex flex-col justify-center px-2 py-1.5">
              <span className="w-fit rounded-full bg-primary/10 px-1.5 py-px text-[5.5px] font-semibold text-primary">
                Художественная школа
              </span>
              <p className="mt-1 line-clamp-3 text-[7.5px] font-semibold leading-snug">
                «Я очень благодарна студии — здесь научилась рисовать и нашла друзей.»
              </p>
              <p className="mt-1 text-[6px] text-[#5e6470]">Софья Харламова</p>
            </div>
          </div>
        </Page>
      );
    case "stories":
      return (
        <Page>
          <Kicker>Жизнь студии</Kicker>
          <Tit className="mt-0.5 text-[11px]">Проекты и события</Tit>
          <div className="mt-1.5 grid min-h-0 flex-1 grid-cols-3 gap-1">
            {[
              [MC, "Мастер-классы"],
              [ART, "Выставки"],
              [ROBOT, "Соревнования"],
            ].map(([src, title]) => (
              <div key={title} className="flex min-h-0 flex-col overflow-hidden rounded-xl bg-white shadow-[0_0_0_1px_rgba(18,20,26,.06)]">
                <div className="aspect-video min-h-0 overflow-hidden">
                  <Pic src={src} />
                </div>
                <span className="px-1.5 py-1 text-[7px] font-semibold leading-tight">{title}</span>
              </div>
            ))}
          </div>
        </Page>
      );
    case "branches":
      return (
        <Page dark>
          <Kicker dark>Три студии</Kicker>
          <Tit dark className="mt-0.5 text-[11px]">
            Сеть в Коломне и Луховицах
          </Tit>
          <div className="mt-1.5 grid min-h-0 flex-1 grid-cols-3 gap-1">
            {BRANCHES.map((b) => (
              <div key={b.address} className="rounded-xl bg-white/5 p-1.5 ring-1 ring-white/10">
                <p className="text-[5.5px] font-semibold uppercase tracking-[0.12em] text-white/45">{b.city}</p>
                <p className="mt-1 text-[7.5px] font-semibold leading-tight text-white">{b.name}</p>
                <p className="mt-1 line-clamp-2 text-[5.5px] leading-snug text-white/55">{b.address}</p>
              </div>
            ))}
          </div>
        </Page>
      );
    case "trial":
    case "trial-form":
      return (
        <Page>
          <div className="flex min-h-0 flex-1 flex-col justify-center rounded-2xl bg-white px-3 py-2 shadow-[0_0_0_1px_rgba(18,20,26,.06)]">
            <Kicker>Пробное занятие</Kicker>
            <Tit className="mt-1 max-w-[85%] text-[13px]">Приведите ребёнка на первое занятие</Tit>
            <p className="mt-1 max-w-[80%] text-[6.5px] leading-snug text-[#5e6470]">
              Без абонемента. После урока решите, продолжать ли.
            </p>
            <div className="mt-2">
              <Cta>Записаться на пробное</Cta>
            </div>
          </div>
        </Page>
      );
    case "buttons":
      return (
        <Page>
          <div className="flex min-h-0 flex-1 items-center">
            <span className="inline-flex h-5 items-center rounded-full bg-primary px-3 text-[8px] font-semibold text-white">
              Пробное занятие
            </span>
          </div>
        </Page>
      );
    case "convert-band":
      return (
        <Page>
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl bg-white shadow-[0_0_0_1px_rgba(18,20,26,.06)]">
            <div className="px-2 py-1.5">
              <Kicker>Ближайшие группы</Kicker>
              <Tit className="mt-0.5 text-[11px]">Прийти на этой неделе</Tit>
            </div>
            <div className="grid min-h-0 flex-1 grid-cols-3 border-t border-black/[0.06]">
              {[
                ["Коломна", "Ср 16:00"],
                ["Коломна", "Чт 17:30"],
                ["Луховицы", "Сб 11:00"],
              ].map(([city, when], i) => (
                <div key={when} className={cn("flex flex-col justify-center px-2 py-1", i && "border-l border-black/[0.06]")}>
                  <p className="text-[5.5px] font-semibold uppercase tracking-[0.12em] text-[#5e6470]">{city}</p>
                  <p className="text-[10px] font-semibold leading-none">{when}</p>
                  <span className="mt-1 w-fit rounded-full bg-primary px-1.5 py-0.5 text-[5.5px] font-semibold text-white">
                    Запись на пробное
                  </span>
                </div>
              ))}
            </div>
          </div>
        </Page>
      );
    case "convert-aside":
      return (
        <Page>
          <div className="mx-auto flex h-full w-[58%] flex-col rounded-2xl bg-white p-2 shadow-[0_0_0_1px_rgba(18,20,26,.06)]">
            <Kicker>Запись</Kicker>
            <Tit className="mt-0.5 text-[12px]">Группа</Tit>
            <div className="mt-1.5 rounded-xl bg-[#f5f6f8] px-1.5 py-1.5">
              <p className="text-[8px] font-semibold leading-tight">Робототехника 7–9</p>
              <p className="mt-0.5 text-[6px] text-[#5e6470]">Ср 16:00 · Коломна</p>
            </div>
            <span className="mt-auto inline-flex h-[14px] items-center justify-center rounded-full bg-primary text-[6.5px] font-semibold text-white">
              Записаться на пробное
            </span>
          </div>
        </Page>
      );
    case "course-story":
    case "heading":
    case "rich-text":
      return (
        <Page>
          {typeId !== "heading" ? <Kicker>О курсе</Kicker> : null}
          <Tit className={cn("max-w-[92%] text-[12px]", typeId !== "heading" && "mt-1")}>
            {typeId === "heading" ? "Заголовок блока" : "Ребёнок собирает, программирует и думает руками"}
          </Tit>
          {typeId !== "heading" ? (
            <p className="mt-1.5 max-w-[90%] text-[7px] leading-relaxed text-[#5e6470]">
              На пробном покажем, как проходит занятие: схема, сборка, код. Без абонемента — после урока решите сами.
            </p>
          ) : null}
        </Page>
      );
    case "why":
    case "sell-why":
      return (
        <Page>
          <Tit className="text-[11px]">{typeId === "sell-why" ? "Через 3 месяца ребёнок умеет" : "Что получит ребёнок — и зачем это сейчас"}</Tit>
          <div className="mt-1.5 grid min-h-0 flex-1 grid-cols-3 gap-1">
            {["Собирает схему", "Пишет код", "Показывает родителям"].map((t, i) => (
              <div key={t} className="rounded-xl bg-white p-1.5 shadow-[0_0_0_1px_rgba(18,20,26,.06)]">
                <p className="text-[10px] font-semibold leading-none text-primary/40">0{i + 1}</p>
                <p className="mt-1 text-[7.5px] font-semibold leading-tight">{t}</p>
              </div>
            ))}
          </div>
        </Page>
      );
    case "program":
      return (
        <Page>
          <Kicker>Программа</Kicker>
          <Tit className="mt-0.5 text-[11px]">Что внутри — по шагам</Tit>
          <div className="mt-1.5 overflow-hidden rounded-xl bg-white shadow-[0_0_0_1px_rgba(18,20,26,.06)]">
            {["Знакомство с набором", "Сборка и схема", "Код и запуск"].map((t, i) => (
              <div key={t} className={cn("flex items-center justify-between px-2 py-1.5", i && "border-t border-black/[0.06]")}>
                <span className="text-[7.5px] font-semibold">{t}</span>
                <span className="text-[8px] text-black/30">{i === 0 ? "–" : "+"}</span>
              </div>
            ))}
          </div>
        </Page>
      );
    case "gallery":
    case "image":
      return (
        <Page>
          {typeId === "gallery" ? (
            <>
              <Kicker>Галерея</Kicker>
              <div className="mt-1.5 grid min-h-0 flex-1 grid-cols-3 gap-1">
                {[ART, SCULPT, ROBOT].map((src) => (
                  <div key={src} className="min-h-0 overflow-hidden rounded-xl">
                    <Pic src={src} />
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="min-h-0 flex-1 overflow-hidden rounded-2xl">
              <Pic src={ART} />
            </div>
          )}
        </Page>
      );
    case "school-courses":
      return (
        <Page>
          <Tit className="text-[11px]">Программы этого направления</Tit>
          <div className="mt-1.5 overflow-hidden rounded-2xl bg-white shadow-[0_0_0_1px_rgba(18,20,26,.06)]">
            {SHOWCASE.slice(0, 3).map((c, i) => (
              <div key={c.href} className={cn("flex items-center gap-1.5 p-1", i && "border-t border-black/[0.06]")}>
                <span className="size-8 shrink-0 overflow-hidden rounded-lg">
                  <Pic src={c.src} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="rounded-full bg-primary/10 px-1 py-px text-[5.5px] font-semibold text-primary">{c.age}</span>
                  <span className="mt-0.5 block text-[8px] font-semibold leading-tight">{c.title}</span>
                </span>
              </div>
            ))}
          </div>
        </Page>
      );
    case "trajectory":
      return (
        <Page>
          <Kicker>Траектория</Kicker>
          <Tit className="mt-0.5 text-[11px]">Ребёнок последовательно проходит путь</Tit>
          <div className="mt-2 flex min-h-0 flex-1 items-stretch gap-1">
            {["5–6 лет", "7–9 лет", "10–14 лет"].map((t, i) => (
              <div key={t} className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl bg-white shadow-[0_0_0_1px_rgba(18,20,26,.06)]">
                <div className="min-h-0 flex-1 overflow-hidden">
                  <Pic src={[ROBOT, CODE, SCIENCE][i]} />
                </div>
                <span className="px-1 py-1 text-center text-[6.5px] font-semibold">{t}</span>
              </div>
            ))}
          </div>
        </Page>
      );
    case "schedule":
      return (
        <Page>
          <Kicker>Расписание</Kicker>
          <Tit className="mt-0.5 text-[11px]">Группы этого курса</Tit>
          <div className="mt-1.5 flex gap-1">
            {["Все города", "Коломна", "Луховицы"].map((t, i) => (
              <span
                key={t}
                className={cn(
                  "inline-flex h-[12px] items-center rounded-full px-1.5 text-[6px] font-semibold",
                  i === 0 ? "bg-[#12141a] text-white" : "bg-white shadow-[0_0_0_1px_rgba(18,20,26,.06)]",
                )}
              >
                {t}
              </span>
            ))}
          </div>
          <div className="mt-1.5 overflow-hidden rounded-xl bg-white shadow-[0_0_0_1px_rgba(18,20,26,.06)]">
            {["Ср 16:00 · Робототехника 7–9", "Чт 17:30 · Робототехника 10–14", "Сб 11:00 · Робототехника 5–6"].map((t, i) => (
              <div key={t} className={cn("px-2 py-1 text-[7px] font-semibold", i && "border-t border-black/[0.06]")}>
                {t}
              </div>
            ))}
          </div>
        </Page>
      );
    case "sell-program":
      return (
        <Page>
          <Kicker>Педагог курса</Kicker>
          <Tit className="mt-0.5 text-[11px]">Кто ведёт — и кому доверяют родители</Tit>
          <div className="mt-1.5 flex min-h-0 flex-1 gap-2 overflow-hidden rounded-2xl bg-white p-1.5 shadow-[0_0_0_1px_rgba(18,20,26,.06)]">
            <span className="w-[38%] min-h-0 overflow-hidden rounded-xl">
              <Pic src={FACE[0]} className="object-top" />
            </span>
            <span className="flex flex-col justify-center">
              <span className="text-[9px] font-semibold leading-tight">Педагог студии</span>
              <span className="mt-1 text-[6.5px] leading-snug text-[#5e6470]">Ведёт группу и помогает выбрать направление.</span>
              <span className="mt-1.5 text-[6.5px] font-semibold text-primary">О педагоге →</span>
            </span>
          </div>
        </Page>
      );
    default:
      return <Hero kicker="Сеть школ" title="Развивайся" shots={[ART, SCULPT, ROBOT]} />;
  }
}

export function BlockPreview({ typeId }: { typeId: string }) {
  return (
    <div className="relative h-44 w-full overflow-hidden bg-[#f5f6f8] [&_img]:outline-none" aria-hidden>
      <div className="pointer-events-none h-full w-full select-none">{inner(typeId)}</div>
    </div>
  );
}
