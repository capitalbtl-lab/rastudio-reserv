import { useMemo, useState } from "react";
import type { SitePage } from "@/data/catalog";
import type { CmsMaster } from "@/data/cms";
import { SITE } from "@/data/site";
import { SeoImage } from "@/components/seo-image";
import { PageLink } from "@/components/page-link";
import { TrialForm } from "@/components/trial-form";
import { Button } from "@/components/ui/button";
import { CmsImg, Kicker, ProseBlocks } from "@/components/cms-blocks";
import { cn } from "@/lib/utils";

export function MasterClassPage({ page, master }: { page: SitePage; master: CmsMaster }) {
  const hero = master.image || page.images[0];
  const sections = [
    { title: "Подробнее о занятии", text: master.long },
    { title: "Что будет на мастер-классе", text: master.whatHappens },
    { title: "Что вы узнаете и чему научитесь", text: master.learn },
    { title: "Почему этот мастер-класс особенный", text: master.special },
    { title: "Кому подойдёт", text: master.who },
    { title: "Результат", text: master.result },
  ].filter((s) => s.text);

  return (
    <article>
      <section className="ink relative isolate min-h-[64dvh] overflow-hidden text-header-fg">
        {hero ? (
          <SeoImage
            src={"src" in hero ? hero.src : master.image!.src}
            alt={master.name}
            filename={"filename" in hero ? hero.filename : master.image!.filename}
            className="absolute inset-0 h-full w-full"
            imgClassName="h-full w-full object-cover opacity-50"
            loading="eager"
          />
        ) : null}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/50 to-black/20" />
        <div className="relative mx-auto flex min-h-[64dvh] max-w-[1180px] flex-col justify-end px-4 pb-28 pt-24 md:px-5">
          <p className="text-sm font-medium text-header-fg/80">
            <PageLink to="/" className="hover:underline">
              Главная
            </PageLink>
            <span className="mx-2 text-header-fg/45">/</span>
            <PageLink to="/master-class" className="hover:underline">
              Мастер-классы
            </PageLink>
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {master.directions.map((d) => (
              <span
                key={d}
                className="bg-bg/15 px-2 py-1 text-xs font-medium uppercase tracking-wider"
              >
                {d}
              </span>
            ))}
          </div>
          <h1 className="hero-title mt-4 max-w-4xl">{master.name}</h1>
          {master.short ? (
            <p className="mt-5 max-w-2xl text-base text-header-fg/80 md:text-lg">{master.short}</p>
          ) : null}
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild size="lg">
              <a href="#trial">Записаться</a>
            </Button>
            <Button asChild size="lg">
              <a href={SITE.phoneHref}>{SITE.phone}</a>
            </Button>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-[1180px] px-4 py-12 md:px-5 md:py-16">
        <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Meta label="Возраст" value={master.ages.join(", ")} />
          <Meta label="Группа" value={master.sizes.join(", ")} />
          <Meta label="Направление" value={master.directions.join(", ")} />
          <Meta label="Место" value={master.places.join(", ")} />
        </dl>

        <div className="mt-14 space-y-14">
          {sections.map((s) => (
            <section key={s.title}>
              <Kicker>Мастер-класс</Kicker>
              <h2 className="display section-title mt-2">{s.title}</h2>
              <ProseBlocks text={s.text} className="mt-5 max-w-3xl" />
            </section>
          ))}
        </div>

        {master.cta ? (
          <div className="mt-16 rounded-lg bg-surface p-6 shadow-[var(--shadow-border)] md:p-8">
            <h2 className="display text-2xl md:text-3xl">Запишитесь сегодня</h2>
            <ProseBlocks text={master.cta} className="mt-4 max-w-3xl" />
          </div>
        ) : null}

        <div className="mt-16">
          <TrialForm compact />
        </div>
      </div>
    </article>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <div className="rounded-lg bg-surface p-4 shadow-[var(--shadow-border)]">
      <dt className="kicker">{label}</dt>
      <dd className="mt-2 text-sm font-medium">{value}</dd>
    </div>
  );
}

export function MasterListPageCms({ page, masters }: { page: SitePage; masters: CmsMaster[] }) {
  const directions = useMemo(() => {
    const set = new Set<string>();
    masters.forEach((m) => m.directions.forEach((d) => set.add(d)));
    return ["Все", ...[...set].sort()];
  }, [masters]);
  const [dir, setDir] = useState("Все");
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return masters.filter((m) => {
      if (dir !== "Все" && !m.directions.includes(dir)) return false;
      if (!s) return true;
      return (
        m.name.toLowerCase().includes(s) ||
        m.short.toLowerCase().includes(s) ||
        m.ages.some((a) => a.toLowerCase().includes(s))
      );
    });
  }, [masters, dir, q]);

  return (
    <article className="mx-auto max-w-[1180px] px-4 py-12 md:px-5 md:py-16">
      <Kicker>Студия</Kicker>
      <h1 className="display section-title mt-2">{page.h1 || "Мастер-классы"}</h1>
      <p className="mt-5 max-w-2xl text-lg text-muted">
        {page.description ||
          page.paragraphs[0] ||
          "Разовые творческие занятия в Коломне: живопись, декор, керамика и арт-вечера."}
      </p>
      <div className="mt-8 flex flex-wrap gap-2">
        {directions.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setDir(item)}
            className={cn(
              "h-11 rounded-sm px-4 text-sm font-medium",
              dir === item
                ? "bg-fg text-bg"
                : "bg-surface text-fg shadow-[var(--shadow-border)] hover:shadow-[var(--shadow-border-hover)]",
            )}
          >
            {item}
          </button>
        ))}
      </div>
      <label className="mt-6 block">
        <span className="sr-only">Поиск мастер-класса</span>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Найти мастер-класс"
          className="h-12 w-full max-w-md rounded-sm border border-border bg-surface px-5 text-sm shadow-[var(--shadow-border)] outline-none focus:ring-2 focus:ring-ring"
        />
      </label>
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((m) => (
          <PageLink
            key={m.id}
            to={m.pathDecoded}
            className="group overflow-hidden rounded-lg bg-surface shadow-[var(--shadow-border)] transition-shadow duration-[var(--motion-fast)] hover:shadow-[var(--shadow-border-hover)]"
          >
            {m.image ? (
              <CmsImg
                image={m.image}
                className="aspect-square bg-surface-2"
                imgClassName="transition-transform duration-[var(--motion-fast)] ease-[var(--ease-out)] group-hover:scale-105"
                alt={m.name}
              />
            ) : (
              <div className="aspect-square bg-surface-2" />
            )}
            <div className="p-4">
              <p className="text-xs font-medium uppercase tracking-wider text-muted">
                {m.directions.join(" · ")}
                {m.ages.length ? ` · ${m.ages.join(", ")}` : ""}
              </p>
              <h2 className="display mt-2 text-xl leading-snug">{m.name}</h2>
              {m.short ? <p className="mt-2 line-clamp-3 text-sm text-muted">{m.short}</p> : null}
            </div>
          </PageLink>
        ))}
      </div>
      {filtered.length === 0 ? (
        <p className="mt-10 text-sm text-muted">По этому запросу мастер-классов нет.</p>
      ) : null}
      <div className="mt-16">
        <TrialForm compact />
      </div>
    </article>
  );
}
