import type { ReactNode } from "react";
import { Check, MapPin } from "lucide-react";
import type { CmsImage, CmsSession, CmsTrajectoryStep } from "@/data/cms";
import { courseKey } from "@/data/cms";
import { SITE } from "@/data/site";
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

export function ScheduleBlock({ sessions }: { sessions: CmsSession[] }) {
  if (!sessions.length) return null;
  const cities = [...new Set(sessions.map((s) => s.city).filter(Boolean))];
  return (
    <section>
      <Kicker>Расписание</Kicker>
      <h2 className="display section-title mt-2">Расписание занятий</h2>
      <p className="mt-3 max-w-2xl text-muted">
        Актуальные группы в Коломне и Луховицах. Место можно уточнить при записи — администратор
        подберёт филиал и время.
      </p>
      <div className="mt-6 space-y-3">
        {sessions.map((s) => (
          <div
            key={s.id}
            className="flex flex-col gap-3 rounded-lg bg-surface p-4 shadow-[var(--shadow-border)] md:flex-row md:items-center md:justify-between md:p-5"
          >
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-muted">
                {s.group}
                {s.city ? ` · ${s.city}` : ""}
                {s.age ? ` · ${s.age}` : ""}
              </p>
              <p className="mt-1 text-sm font-medium md:text-base">{s.when}</p>
              {s.branch ? (
                <p className="mt-1 flex items-start gap-1.5 text-xs text-muted">
                  <MapPin className="mt-0.5 size-3.5 shrink-0" />
                  {s.branch}
                </p>
              ) : null}
            </div>
            {s.signup ? (
              <Button asChild size="sm" className="shrink-0">
                <a href={s.signup}>Записаться</a>
              </Button>
            ) : null}
          </div>
        ))}
      </div>
      {cities.length ? (
        <p className="mt-4 text-xs text-muted">Филиалы: {cities.join(" · ")}</p>
      ) : null}
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
}: {
  kicker: ReactNode;
  age?: string | null;
  title: string;
  description?: string | null;
  images: HeroShot[];
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

        {shots.length ? (
          <>
            <div className="relative hidden lg:block">
              <div className="photo-stack">
                {shots.map((shot, i) => (
                  <div key={`${shot.src}-${i}`} className="shot bg-header">
                    <SeoImage
                      src={shot.src}
                      alt={shot.alt || title}
                      filename={shot.filename}
                      className="h-full w-full"
                      imgClassName="h-full w-full object-cover"
                      loading="eager"
                    />
                  </div>
                ))}
              </div>
            </div>
            <div className="snap-row lg:hidden">
              {shots.map((shot, i) => (
                <div key={`${shot.src}-m-${i}`} className="snap-card overflow-hidden rounded-3xl">
                  <SeoImage
                    src={shot.src}
                    alt={shot.alt || title}
                    filename={shot.filename}
                    className="aspect-4/5"
                    loading="eager"
                  />
                </div>
              ))}
            </div>
          </>
        ) : null}
      </div>
    </section>
  );
}
