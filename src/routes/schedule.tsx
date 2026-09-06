import { createFileRoute } from "@tanstack/react-router";
import { loadFullSchedule } from "@/data/load-site-page";
import { SiteShell } from "@/components/site-shell";
import { ScheduleFinder } from "@/components/schedule-finder";
import { pageHead, SEO_ORIGIN, breadcrumbJsonLd } from "@/data/seo";
import { SEO_COPY } from "@/data/seo-copy";
import { JsonLd } from "@/components/json-ld";
import { CoursePageHero } from "@/components/cms-blocks";

const copy = SEO_COPY["/schedule"];

export const Route = createFileRoute("/schedule")({
  loader: () => loadFullSchedule(),
  head: () =>
    pageHead({
      title: copy.title || "Расписание",
      description: copy.description,
      canonical: `${SEO_ORIGIN}/schedule`,
      path: "/schedule",
    }),
  component: SchedulePage,
});

function SchedulePage() {
  const { sessions } = Route.useLoaderData();
  return (
    <SiteShell>
      <JsonLd data={breadcrumbJsonLd("/schedule", "Расписание")} />
      <CoursePageHero
        kicker="Коломна · Луховицы"
        title="Расписание"
        description="Филиал, возраст, день — группы как в кабинете. Время обновляется с расписания студии."
        images={[]}
        secondary={{ href: "/allcourses", label: "Все курсы" }}
        path="/schedule"
      />
      <article className="page-wrap py-12 md:py-16">
        <ScheduleFinder sessions={sessions} />
      </article>
    </SiteShell>
  );
}
