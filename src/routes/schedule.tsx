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
        <h1 className="display mt-3 text-4xl md:text-5xl">Расписание</h1>
        <p className="mt-4 max-w-2xl text-muted">
          Выберите город и возраст — увидите группы по филиалам. Запись с карточки уходит администратору.
        </p>
        <ScheduleBlock sessions={sessions} heading={false} />
      </article>
    </SiteShell>
  );
}
