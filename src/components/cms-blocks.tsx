import type { ReactNode } from "react";
import { useState } from "react";
import { Check, ChevronDown, FlaskConical, MapPin, Sparkles, Users } from "lucide-react";
import type { CmsImage, CmsSession, CmsTrajectoryStep } from "@/data/cms";
import type { CourseCard } from "@/data/catalog";
import { courseKey } from "@/data/cms";
import { SITE, coursesForSchool } from "@/data/site";
import { SeoImage } from "@/components/seo-image";
import { PageLink } from "@/components/page-link";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function Kicker({ children, className }: { children: string; className?: string }) {
  return <p className={cn("kicker", className)}>{children}</p>;
}

export function BulletList({ items, light = false }: { items: string[]; light?: boolean }) {
  if (!items.length) return null;
  return (
    <ul className="space-y-2.5">
      {items.map((item) => (
        <li key={item.slice(0, 72)} className="flex gap-2.5 text-sm leading-snug md:text-[0.95rem]">
          <Check
            className={cn(
              "mt-0.5 size-4 shrink-0",
              light ? "text-current opacity-80" : "text-primary",
            )}
            strokeWidth={2.4}
          />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

export function CmsImg({
  image,
  className,
  imgClassName,
  alt,
  loading,
}: {
  image: CmsImage | null | undefined;
  className?: string;
  imgClassName?: string;
  alt?: string;
  loading?: "lazy" | "eager";
}) {
  if (!image) return null;
  return (
    <SeoImage
      src={image.src}
      alt={alt || image.alt || image.filename}
      filename={image.filename}
      className={className}
      imgClassName={imgClassName}
      loading={loading}
    />
  );
}

const PROGRAM_HREF: Record<string, string> = {
  start: "/kursy-shkoly-programmirovaniya/it-лаборатория-create-для-детей-5-7-лет",
  "create-7": "/kursy-shkoly-programmirovaniya/it-лаборатория-create-для-детей-7-9-лет",
  dev: "/kursy-shkoly-programmirovaniya/it-лаборатория-dev-для-детей-9-10-лет",
  python: "/kursy-shkoly-programmirovaniya/it-школа-программирование-на-python",
  gamedev: "/kursy-shkoly-programmirovaniya/it-школа-разработка-игр-на-unity",
  cpp: "/kursy-shkoly-programmirovaniya/it-школа-программирование-на-си",
};

export function Trajectory({
  steps,
  currentName,
}: {
  steps: CmsTrajectoryStep[];
  currentName?: string;
}) {
  if (!steps.length) return null;
  const currentKey = currentName ? courseKey(currentName) : "";
  return (
    <div className="snap-row traj-row">
      {steps.map((step) => {
        const href =
          PROGRAM_HREF[
            step.name === "С++"
              ? "cpp"
              : step.name === "CREATE"
                ? "create-7"
                : step.name.toLowerCase()
          ] ?? "/programming-school";
        const active =
          currentKey !== "" &&
          (courseKey(step.name) === currentKey ||
            (step.name === "PYTHON" && currentKey === "python") ||
            (step.name === "GAMEDEV" && currentKey === "gamedev") ||
            (step.name === "С++" && currentKey === "cpp") ||
            (step.name === "CREATE" && currentKey === "create-7") ||
            (step.name === "DEV" && currentKey === "dev") ||
            (step.name === "START" && currentKey === "start"));
        return (
          <PageLink
            key={step.id}
            to={href || "/programming-school"}
            className={cn(
              "snap-card relative overflow-hidden rounded-lg bg-fg text-bg shadow-[var(--shadow-border)]",
              active && "ring-2 ring-primary ring-offset-2 ring-offset-bg",
            )}
          >
            {step.bg1 ? (
              <CmsImg
                image={step.bg1}
                className="absolute inset-0"
                imgClassName="h-full w-full object-cover opacity-45"
              />
            ) : null}
            <div className="absolute inset-0 bg-gradient-to-t from-fg via-fg/55 to-fg/20" />
            <div className="relative flex min-h-[17rem] flex-col justify-end p-4">
              <p className="font-display text-xs tracking-[0.22em] text-bg/70">
                {String(step.order).padStart(2, "0")} · {step.age}
              </p>
              <p className="font-display mt-1 text-2xl tracking-wide">{step.name}</p>
              <ul className="mt-3 space-y-0.5 text-xs text-bg/75">
                {step.description.slice(0, 5).map((d) => (
                  <li key={d}>{d}</li>
                ))}
              </ul>
            </div>
          </PageLink>
        );
      })}
    </div>
  );
}

const WEEKDAYS: [RegExp, string][] = [
  [/понедельник/i, "Пн"],
  [/вторник/i, "Вт"],
  [/сред/i, "Ср"],
  [/четверг/i, "Чт"],
  [/пятниц/i, "Пт"],
  [/суббот/i, "Сб"],
  [/воскресень/i, "Вс"],
];

function compactWhen(when: string) {
  if (!when) return "";
  const days = WEEKDAYS.filter(([re]) => re.test(when)).map(([, d]) => d);
  const times = [...when.matchAll(/(\d{1,2}:\d{2})\s*до\s*(\d{1,2}:\d{2})/gi)].map(
    (m) => `${m[1]}–${m[2]}`,
  );
  const twice = /2\s*раза/i.test(when);
  if (days.length && times.length) return `${twice ? "2× " : ""}${days.join("/")} ${times.join(", ")}`;
  if (days.length) return `${twice ? "2× " : ""}${days.join("/")}`;
  return when.replace(/^Занятия\s+/i, "");
}

function branchRank(session: CmsSession) {
  const blob = `${session.city} ${session.branch}`;
  if (/октябрьск/i.test(blob)) return 0;
  if (/гражданск/i.test(blob)) return 1;
  if (/луховиц|пушкин/i.test(blob)) return 2;
  return 9;
}

function branchLabel(session: CmsSession) {
  const blob = `${session.city} ${session.branch}`;
  if (/октябрьск/i.test(blob)) return "Коломна · Октябрьской революции, 340";
  if (/гражданск/i.test(blob)) return "Коломна · Гражданская, 2";
  if (/пушкин|луховиц/i.test(blob)) return "Луховицы · Пушкина, 202А";
  if (session.city && session.branch) return `${session.city} · ${session.branch}`;
  return session.branch || session.city || "Филиал";
}

function ageRank(age: string) {
  const n = age.match(/\d+/);
  return n ? Number(n[0]) : 99;
}

export function ScheduleBlock({ sessions }: { sessions: CmsSession[] }) {
  if (!sessions.length) return null;
  const ordered = [...sessions].sort((a, b) => {
    const br = branchRank(a) - branchRank(b);
    if (br) return br;
    const age = ageRank(a.age) - ageRank(b.age);
    if (age) return age;
    return compactWhen(a.when).localeCompare(compactWhen(b.when), "ru");
  });
  const groups: { label: string; items: CmsSession[] }[] = [];
  for (const session of ordered) {
    const label = branchLabel(session);
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.items.push(session);
    else groups.push({ label, items: [session] });
  }

  return (
    <section className="mt-10">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="display text-xl md:text-2xl">Расписание</h2>
        <p className="text-xs text-muted">филиалы · возраста</p>
      </div>
      <div className="mt-4 space-y-4">
        {groups.map((group) => (
          <div key={group.label}>
            <p className="flex items-center gap-1.5 text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-muted">
              <MapPin className="size-3.5" />
              {group.label}
            </p>
            <ul className="mt-2 overflow-hidden rounded-xl bg-surface shadow-[var(--shadow-border)]">
              {group.items.map((s, i) => (
                <li
                  key={s.id}
                  className={cn(
                    "grid grid-cols-[5.5rem_1fr_auto] items-center gap-2 px-3 py-2 text-sm md:grid-cols-[6.5rem_1fr_auto] md:gap-3 md:px-4",
                    i ? "border-t border-border/80" : "",
                  )}
                >
                  <span className="text-[0.78rem] font-semibold leading-tight">{s.age || "группа"}</span>
                  <span className="min-w-0 truncate text-[0.82rem] text-muted">{compactWhen(s.when)}</span>
                  {s.signup ? (
                    <a href={s.signup} className="text-[0.72rem] font-semibold text-primary hover:underline">
                      Запись
                    </a>
                  ) : (
                    <span />
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}

export function ProseBlocks({ text, className }: { text: string; className?: string }) {
  if (!text) return null;
  return (
    <div className={cn("space-y-4 text-[0.98rem] leading-relaxed text-fg/90", className)}>
      {text.split(/\n{2,}/).map((p) => (
        <p key={p.slice(0, 48)}>{p}</p>
      ))}
    </div>
  );
}

type HeroShot = { src: string; filename?: string; alt?: string };

export function CoursePageHero({
  kicker,
  age,
  title,
  description,
  images,
  video,
}: {
  kicker: ReactNode;
  age?: string | null;
  title: string;
  description?: string | null;
  images: HeroShot[];
  video?: string | null;
}) {
  const srcs = images.filter((img) => img?.src);
  const shots: HeroShot[] = [];
  if (srcs.length) {
    shots.push(...srcs);
    let i = 0;
    while (shots.length < 3) {
      shots.push(srcs[i % srcs.length]);
      i += 1;
    }
    shots.splice(3);
  }

  function ShotMedia({ shot, className, imgClassName }: { shot: HeroShot; className?: string; imgClassName?: string }) {
    return (
      <SeoImage
        src={shot.src}
        alt={shot.alt || title}
        filename={shot.filename}
        className={className}
        imgClassName={imgClassName}
        loading="eager"
      />
    );
  }

  return (
    <section className="ink relative isolate overflow-hidden text-header-fg">
      <div className="page-wrap grid items-center gap-10 py-16 md:py-20 lg:grid-cols-[1.05fr_0.95fr] lg:min-h-[88dvh] lg:gap-8 lg:py-8">
        <div className="relative z-10 max-w-xl">
          <div className="hero-in kicker text-header-fg/55">{kicker}</div>
          {age ? <p className="hero-in mt-4 text-sm font-medium text-header-fg/70">{age}</p> : null}
          <h1 className="hero-in hero-in-2 mt-5 text-[clamp(2.1rem,1.2rem+3vw,3.8rem)] leading-[1.05]">
            {title}
          </h1>
          {description ? (
            <p className="hero-in hero-in-3 mt-5 max-w-md text-[1.02rem] leading-relaxed text-header-fg/70">
              {description}
            </p>
          ) : null}
          <div className="hero-in hero-in-3 mt-8 flex flex-wrap gap-3">
            <Button asChild size="lg">
              <a href="#trial">Записаться</a>
            </Button>
            <Button asChild size="lg" variant="outline">
              <a href={SITE.phoneHref}>{SITE.phone}</a>
            </Button>
          </div>
        </div>

        {shots.length || video ? (
          <>
            <div className="relative hidden lg:block">
              <div className="photo-stack">
                {shots.slice(0, video ? 2 : 3).map((shot, i) => (
                  <div key={`${shot.src}-${i}`} className="shot bg-header">
                    <ShotMedia shot={shot} className="h-full w-full" imgClassName="h-full w-full object-cover" />
                  </div>
                ))}
                {video ? (
                  <div className="shot bg-header">
                    <video
                      src={video}
                      className="h-full w-full object-cover"
                      autoPlay
                      muted
                      loop
                      playsInline
                      preload="metadata"
                      aria-label={title}
                    />
                  </div>
                ) : null}
              </div>
            </div>
            <div className="snap-row lg:hidden">
              {video ? (
                <div className="snap-card overflow-hidden rounded-3xl">
                  <video
                    src={video}
                    className="aspect-4/5 w-full object-cover"
                    autoPlay
                    muted
                    loop
                    playsInline
                    preload="metadata"
                    aria-label={title}
                  />
                </div>
              ) : null}
              {shots.map((shot, i) => (
                <div key={`${shot.src}-m-${i}`} className="snap-card overflow-hidden rounded-3xl">
                  <ShotMedia shot={shot} className="aspect-4/5" />
                </div>
              ))}
            </div>
          </>
        ) : null}
      </div>
    </section>
  );
}

const SKIP_COPY =
  /договор оферты|хотите посетить пробное|интересует другое расписание|плоды моих трудов|служба по мере сил|фабрика или завод|выбирайте педагога, который будет соответствовать|размещены здесь/i;
const SKIP_HEADING = /педагог курса|онлайн-запись|и это только начало/i;
const PRICE_COPY = /стоимость занятий|\d[\d\s]*руб/i;
const LESSON_COPY = /^урок\s*\d+/i;

function firstSentence(text: string) {
  const match = text.match(/^[^.!?]+[.!?]/);
  return (match ? match[0] : text).trim();
}

export function Expandable({
  preview,
  rest,
  moreLabel = "Читать полностью",
}: {
  preview: ReactNode;
  rest?: ReactNode;
  moreLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  if (!rest) return <>{preview}</>;
  return (
    <div>
      {preview}
      {open ? <div className="mt-4">{rest}</div> : null}
      <button
        type="button"
        className="mt-5 inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-primary"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        {open ? "Свернуть" : moreLabel}
        <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} />
      </button>
    </div>
  );
}

function AccordionItems({ items }: { items: { title: string; body: string }[] }) {
  const [open, setOpen] = useState(0);
  if (!items.length) return null;
  return (
    <div className="divide-y divide-border w-full overflow-hidden rounded-xl bg-surface shadow-[var(--shadow-border)]">
      {items.map((item, i) => {
        const active = open === i;
        return (
          <div key={item.title + i}>
            <button
              type="button"
              className="flex min-h-12 w-full items-center justify-between gap-3 px-5 py-4 text-left"
              aria-expanded={active}
              onClick={() => setOpen(active ? -1 : i)}
            >
              <span className="flex items-baseline gap-3">
                <span className="display text-sm text-muted">{String(i + 1).padStart(2, "0")}</span>
                <span className="font-medium leading-snug">{item.title}</span>
              </span>
              <ChevronDown className={cn("size-4 shrink-0 text-muted transition-transform", active && "rotate-180")} />
            </button>
            {active ? (
              <p className="px-5 pb-5 text-sm leading-relaxed text-muted md:text-[0.95rem]">{item.body}</p>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

const WHY_NOW = [
  {
    icon: Sparkles,
    title: "Результат с первого занятия",
    text: "Не конспект в тетради — проект, опыт или работа, которую можно показать дома.",
  },
  {
    icon: FlaskConical,
    title: "Навык 2026: делать",
    text: "Ребёнок пробует руками, думает и собирает портфолио. Это то, что остаётся.",
  },
  {
    icon: Users,
    title: "Пробное без риска",
    text: "Группы до 10 человек. Приходите на пробное — и решаете, ваше ли это.",
  },
] as const;

export function CourseStory({
  paragraphs,
  headings,
  afterLead,
}: {
  paragraphs: string[];
  headings: { tag: string; text: string }[];
  afterLead?: ReactNode;
}) {
  const clean = paragraphs.filter((p) => p && !SKIP_COPY.test(p));
  const price = clean.find((p) => PRICE_COPY.test(p));
  const lessons = clean.filter((p) => LESSON_COPY.test(p));
  const story = clean.filter((p) => p !== price && !LESSON_COPY.test(p));
  const chapters = headings
    .map((h) => h.text)
    .filter((t) => t && !SKIP_HEADING.test(t));

  const lead = story[0] || "";
  const quote = lead ? firstSentence(lead) : "";
  const leadRest = lead.slice(quote.length).trim();
  const teaser = story[1];
  const folded = story.slice(2);

  const accordion =
    lessons.length > 0
      ? lessons.map((body) => {
          const match = body.match(/^Урок\s*(\d+)\s*[:.—-]?\s*(.*)$/i);
          const detail = match?.[2]?.split(".")[0]?.trim();
          return {
            title: match ? (detail ? `Урок ${match[1]}. ${detail}` : `Урок ${match[1]}`) : body.slice(0, 72),
            body,
          };
        })
      : chapters.slice(0, Math.max(folded.length, chapters.length)).map((title, i) => ({
          title,
          body: folded[i] || "Разберём это на занятии — с практикой, а не только в теории.",
        }));

  const leftover = lessons.length ? folded : folded.slice(chapters.length);

  return (
    <div className="space-y-12">
      {lead ? (
        <section>
          <p className="kicker">О курсе</p>
          <blockquote className="display mt-3 max-w-3xl text-2xl leading-snug md:text-3xl">
            {quote}
          </blockquote>
          {leadRest ? <p className="mt-4 max-w-3xl text-[1.02rem] leading-relaxed text-fg/80">{leadRest}</p> : null}
          {teaser ? <p className="mt-4 max-w-3xl text-[1.02rem] leading-relaxed text-fg/80">{teaser}</p> : null}
        </section>
      ) : null}

      {afterLead}

      <section>
        <p className="kicker">Почему сейчас</p>
        <h2 className="display section-title mt-2">Курс, который чувствуется, а не зубрится</h2>
        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          {WHY_NOW.map((item) => (
            <article key={item.title} className="rounded-xl bg-surface p-5 shadow-[var(--shadow-border)]">
              <item.icon className="size-5 text-primary" strokeWidth={1.8} />
              <h3 className="display mt-3 text-lg leading-snug">{item.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{item.text}</p>
            </article>
          ))}
        </div>
      </section>

      {accordion.length ? (
        <section>
          <p className="kicker">Программа</p>
          <h2 className="display section-title mt-2">Что внутри — по шагам</h2>
          <p className="mt-3 max-w-2xl text-sm text-muted">Откройте блок, чтобы увидеть подробности. На пробном покажем живьём.</p>
          <div className="mt-6 w-full">
            <AccordionItems items={accordion} />
          </div>
          {leftover.length ? (
            <Expandable
              preview={null}
              more={
                <div className="space-y-4 text-[0.98rem] leading-relaxed text-fg/80">
                  {leftover.map((p) => (
                    <p key={p.slice(0, 40)}>{p}</p>
                  ))}
                </div>
              }
              moreLabel="Ещё о программе"
            />
          ) : null}
        </section>
      ) : leftover.length ? (
        <section>
          <p className="kicker">Подробнее</p>
          <Expandable
            preview={
              <p className="mt-3 max-w-3xl text-[1.02rem] leading-relaxed text-fg/80">{leftover[0]}</p>
            }
            rest={
              leftover.length > 1 ? (
                <div className="space-y-4 text-[0.98rem] leading-relaxed text-fg/80">
                  {leftover.slice(1).map((p) => (
                    <p key={p.slice(0, 40)}>{p}</p>
                  ))}
                </div>
              ) : null
            }
          />
        </section>
      ) : null}

      {price ? (
        <section className="w-full rounded-xl bg-ink px-5 py-6 text-header-fg md:px-8">
          <p className="kicker text-header-fg/55">Формат и стоимость</p>
          <p className="mt-3 max-w-3xl text-sm leading-relaxed text-header-fg/80 md:text-base">{price}</p>
          <Button asChild className="mt-5">
            <a href="#trial">Записаться на пробное</a>
          </Button>
        </section>
      ) : null}
    </div>
  );
}

export function ExpandableProse({ text, extra }: { text: string; extra?: string }) {
  if (!text) return extra ? <ProseBlocks text={extra} /> : null;
  const chunks = text.split(/\n{2,}/).filter(Boolean);
  const preview = chunks[0];
  const rest = [...chunks.slice(1), extra].filter(Boolean).join("\n\n");
  if (!rest) return <ProseBlocks text={text} />;
  return (
    <Expandable
      preview={<p className="text-[0.98rem] leading-relaxed text-fg/90">{preview}</p>}
      rest={<ProseBlocks text={rest} />}
      moreLabel="Читать полностью"
    />
  );
}

function ageRanges(text: string): [number, number][] {
  if (!text) return [];
  const t = text.replace(/[–—]/g, "-");
  const out: [number, number][] = [];
  for (const m of t.matchAll(/(\d+)\s*-\s*(\d+)/g)) out.push([Number(m[1]), Number(m[2])]);
  for (const m of t.matchAll(/(\d+)\s*\+/g)) out.push([Number(m[1]), 18]);
  if (!out.length) {
    const years = [...t.matchAll(/\d+/g)].map((m) => Number(m[0])).filter((n) => n >= 2 && n <= 18);
    if (years.length === 1) out.push([years[0], years[0]]);
    else if (years.length >= 2) out.push([Math.min(...years), Math.max(...years)]);
  }
  return out;
}

function agesOverlap(a: string, b: string) {
  const left = ageRanges(a);
  const right = ageRanges(b);
  if (!left.length || !right.length) return false;
  return left.some(([x1, x2]) => right.some(([y1, y2]) => x1 <= y2 && y1 <= x2));
}

export function RelatedAgeCourses({
  currentPath,
  currentAge,
  courses,
}: {
  currentPath: string;
  currentAge?: string | null;
  courses: CourseCard[];
}) {
  const mine = currentAge || courses.find((c) => c.href === currentPath)?.age || "";
  const peers = courses
    .filter((c) => c.href !== currentPath && c.image && agesOverlap(mine, c.age || ""))
    .slice(0, 8);
  if (!peers.length) return null;
  const heading = mine ? `Курсы для детей ${mine.replace(/^для детей\s+/i, "")}` : "Курсы этого возраста";

  return (
    <div className="mt-12">
      <p className="kicker">По возрасту</p>
      <h2 className="display mt-2 text-2xl md:text-3xl">{heading}</h2>
      <ul className="mt-6 grid gap-3 sm:grid-cols-2">
        {peers.map((course) => (
          <li key={course.href}>
            <PageLink
              to={course.href}
              className="flex items-center gap-3 rounded-xl bg-surface p-2 pr-4 shadow-[var(--shadow-border)] transition-shadow hover:shadow-[var(--shadow-border-hover)]"
            >
              <SeoImage
                src={course.image}
                alt={course.alt}
                filename={course.filename}
                className="size-16 shrink-0 overflow-hidden rounded-lg bg-surface-2"
                imgClassName="h-full w-full object-cover"
              />
              <span>
                <span className="block text-sm font-semibold leading-snug">{course.label}</span>
                {course.age ? <span className="mt-0.5 block text-xs text-muted">{course.age}</span> : null}
              </span>
            </PageLink>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function SchoolCourseList({
  schoolPath,
  courses,
  wide = false,
}: {
  schoolPath: string;
  courses: CourseCard[];
  wide?: boolean;
}) {
  const list = coursesForSchool(schoolPath, courses);
  if (!list.length) return null;
  return (
    <div>
      <p className="kicker">Курсы школы</p>
      <h2 className="display mt-2 text-2xl md:text-3xl">Программы этого направления</h2>
      <ul className={cn("mt-6 grid grid-cols-2 gap-3 md:gap-4", wide && "lg:grid-cols-3")}>
        {list.map((course) => (
          <li key={course.href}>
            <PageLink
              to={course.href}
              className="course-card course-reveal group overflow-hidden rounded-3xl bg-header text-header-fg shadow-[var(--shadow-border)]"
            >
              <SeoImage
                src={course.image}
                alt={course.alt}
                filename={course.filename}
                className="course-media aspect-[4/5]"
              />
              <div className="course-copy relative -mt-20 bg-gradient-to-t from-header via-header/85 to-transparent px-3 pb-3 pt-12 md:px-4 md:pb-4">
                {course.age ? (
                  <p className="text-[0.68rem] font-semibold text-header-fg/65">{course.age}</p>
                ) : null}
                <p className="display mt-1 text-[0.95rem] leading-tight md:text-lg">{course.label}</p>
                <span className="course-cta text-header-fg">Смотреть курс</span>
              </div>
            </PageLink>
          </li>
        ))}
      </ul>
    </div>
  );
}
