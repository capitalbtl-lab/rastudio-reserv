import type { TeacherCard } from "@/data/catalog";
import { isPublishedTeacher } from "@/data/catalog";
import {
  lookupSell,
  COURSE_OUTCOMES,
  COURSE_LADDER,
  COURSE_OUTLOOK,
  teachersForCourse,
} from "@/data/course-sell";
import { SeoImage } from "@/components/seo-image";
import { PageLink } from "@/components/page-link";

export function CourseOutcomes({ path }: { path: string }) {
  const items = lookupSell(COURSE_OUTCOMES, path);
  if (!items?.length) return null;
  return (
    <section>
      <p className="kicker">Результат</p>
      <h2 className="display section-title mt-2">Через 3 месяца ребёнок умеет</h2>
      <ol className="mt-6 grid gap-3 sm:grid-cols-2">
        {items.map((item, i) => (
          <li key={item} className="flex gap-3 rounded-2xl bg-surface p-4 shadow-[var(--shadow-border)] md:p-5">
            <span className="display w-8 shrink-0 text-xl text-primary/70">0{i + 1}</span>
            <p className="text-[0.95rem] leading-relaxed text-fg/90">{item}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function CourseTeacher({ path, teachers }: { path: string; teachers: TeacherCard[] }) {
  const people = teachersForCourse(path, teachers.filter(isPublishedTeacher));
  if (!people.length) return null;
  return (
    <section>
      <p className="kicker">Педагог курса</p>
      <h2 className="display section-title mt-2">Кто ведёт — и кому доверяют родители</h2>
      <div className={people.length > 1 ? "mt-6 grid gap-3 sm:grid-cols-2" : "mt-6"}>
        {people.map((t) => (
          <PageLink
            key={t.href + t.name}
            to={t.href}
            className="flex gap-4 overflow-hidden rounded-2xl bg-surface p-3 shadow-[var(--shadow-border)] transition-shadow hover:shadow-[var(--shadow-border-hover)] sm:p-4"
          >
            <SeoImage
              src={t.photo}
              alt={t.name}
              filename={t.name}
              className="size-24 shrink-0 rounded-xl bg-surface-2 sm:size-28"
              imgClassName="object-top"
            />
            <span className="min-w-0 py-1">
              <span className="display block text-lg leading-snug md:text-xl">{t.name}</span>
              {t.role ? <span className="mt-2 block text-sm leading-relaxed text-muted">{t.role}</span> : null}
              <span className="mt-3 inline-block text-sm font-semibold text-primary">О педагоге →</span>
            </span>
          </PageLink>
        ))}
      </div>
    </section>
  );
}

export function CourseLadder({ path }: { path: string }) {
  const item = lookupSell(COURSE_LADDER, path);
  if (!item) return null;
  return (
    <section>
      <p className="kicker">Лестница сети</p>
      <h2 className="display section-title mt-2">Что дальше в «Развивайся»</h2>
      <PageLink
        to={item.next.href}
        className="mt-6 block rounded-2xl bg-surface p-5 shadow-[var(--shadow-border)] transition-shadow hover:shadow-[var(--shadow-border-hover)] md:p-6"
      >
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">{item.heading}</p>
        <p className="display mt-3 text-xl leading-snug md:text-2xl">{item.next.label}</p>
        <p className="mt-3 max-w-2xl text-[0.95rem] leading-relaxed text-muted">{item.text}</p>
        <p className="mt-4 text-sm font-semibold text-primary">Смотреть следующую ступень →</p>
      </PageLink>
    </section>
  );
}

export function CourseOutlook({ path }: { path: string }) {
  const block = lookupSell(COURSE_OUTLOOK, path);
  if (!block) return null;
  return (
    <section>
      <p className="kicker">Навык и перспектива</p>
      <h2 className="display section-title mt-2 max-w-3xl">{block.heading}</h2>
      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        {block.items.map((item, i) => (
          <article key={item.title} className="rounded-2xl bg-surface p-5 shadow-[var(--shadow-border)] md:p-6">
            <p className="display text-[1.65rem] leading-none text-primary/35">0{i + 1}</p>
            <h3 className="display mt-3 text-xl leading-snug">{item.title}</h3>
            <p className="mt-2 text-[0.95rem] leading-relaxed text-muted">{item.text}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

export function CourseSellAfterWhy({ path }: { path: string }) {
  return <CourseOutcomes path={path} />;
}

export function CourseSellAfterProgram({ path, teachers }: { path: string; teachers: TeacherCard[] }) {
  return (
    <div className="space-y-12">
      <CourseTeacher path={path} teachers={teachers} />
      <CourseLadder path={path} />
      <CourseOutlook path={path} />
    </div>
  );
}
