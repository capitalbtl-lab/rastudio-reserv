import { createFileRoute } from "@tanstack/react-router";
import { loadFullSchedule } from "@/data/load-site-page";
import { SiteShell } from "@/components/site-shell";
import { ScheduleBlock } from "@/components/schedule-block";

export const Route = createFileRoute("/schedule")({
  loader: () => loadFullSchedule(),
  head: () => ({
    meta: [
      { title: "Расписание занятий | Студия «Развивайся»" },
      {
        name: "description",
        content: "Расписание групп в Коломне и Луховицах — по городу, филиалу и возрасту.",
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
        <h1 className="display mt-3 text-4xl md:text-5xl">Расписание курсов</h1>
        <p className="mt-4 max-w-2xl text-muted">
          Группы с таблицы занятий: курс, возраст, день и филиал. Фильтры сверху, запись — с строки группы.
        </p>
        <ScheduleBlock sessions={sessions} heading={false} byCourse />
      </article>
    </SiteShell>
  );
}
