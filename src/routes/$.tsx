import { createFileRoute, notFound } from "@tanstack/react-router";
import { loadSitePage } from "@/data/load-site-page";
import { pageHead } from "@/data/seo";
import { SiteShell } from "@/components/site-shell";
import { PageArticle } from "@/components/page-article";
import { PageLink } from "@/components/page-link";

export const Route = createFileRoute("/$")({
  validateSearch: (search: Record<string, unknown>) => ({
    age: typeof search.age === "string" ? search.age : undefined,
    city: typeof search.city === "string" ? search.city : undefined,
  }),
  loader: async ({ params }) => {
    const data = await loadSitePage({ data: params._splat });
    if (!data) throw notFound();
    return data;
  },
  head: ({ loaderData }) =>
    loaderData
      ? pageHead({
          ...loaderData.page,
          path: loaderData.page.pathDecoded || loaderData.page.path,
        })
      : {
          meta: [
            { title: "Страница не найдена | Студия «Развивайся»" },
            { name: "robots", content: "noindex, follow" },
            {
              name: "description",
              content: "Страница не найдена. Откройте каталог курсов студии «Развивайся» в Коломне.",
            },
          ],
        },
  component: CatchAll,
  notFoundComponent: NotFoundPage,
});

function CatchAll() {
  const data = Route.useLoaderData();
  return (
    <SiteShell>
      <PageArticle
        page={data.page}
        teachers={data.teachers}
        courses={data.courses}
        masters={data.masters}
        cmsCourse={data.cmsCourse}
        cmsMaster={data.cmsMaster}
        cmsCourses={data.cmsCourses}
        cmsMasters={data.cmsMasters}
        trajectory={data.trajectory}
        schedule={data.schedule}
        edits={data.edits}
      />
    </SiteShell>
  );
}

function NotFoundPage() {
  return (
    <SiteShell>
      <div className="mx-auto max-w-xl px-4 py-24 text-center">
        <p className="text-sm font-medium text-primary">404</p>
        <h1 className="display mt-3 text-4xl uppercase">Страница не найдена</h1>
        <p className="mt-4 text-muted">
          Этот адрес не входит в карту сайта rastudio.org. Вернитесь на главную или в каталог курсов.
        </p>
        <div className="mt-8 flex justify-center gap-4 text-sm font-medium">
          <PageLink to="/" className="text-primary hover:underline">
            На главную
          </PageLink>
          <PageLink to="/allcourses" className="hover:underline">
            Все курсы
          </PageLink>
        </div>
      </div>
    </SiteShell>
  );
}
