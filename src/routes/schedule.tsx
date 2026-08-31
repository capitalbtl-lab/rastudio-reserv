import { createFileRoute } from "@tanstack/react-router";
import { loadFullSchedule } from "@/data/load-site-page";
import { SiteShell } from "@/components/site-shell";
import { ScheduleFinder } from "@/components/schedule-finder";

export const Route = createFileRoute("/schedule")({
  loader: () => loadFullSchedule(),
  head: () => ({
    meta: [
      { title: "Расписание занятий | Студия «Развивайся»" },
      {
        name: "description",
        content: "Расписание групп в Коломне и Луховицах — город, возраст и день недели.",
      },
    ],
  }),
  component: SchedulePage,
});

function SchedulePage() {
  const { sessions } = Route.useLoaderData();
  return (
    <SiteShell>
      <article className="page-wrap py-12 md:py-16">
        <p className="kicker">Коломна · Луховицы</p>
        <h1 className="display mt-3 text-4xl md:text-5xl">Расписание</h1>
        <p className="mt-4 max-w-2xl text-muted">
          Сначала город и возраст, затем день. В списке — курс, время и филиал.
        </p>
        <ScheduleFinder sessions={sessions} />
      </article>
    </SiteShell>
  );
}
