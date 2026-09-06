import { createFileRoute, notFound } from "@tanstack/react-router";
import { loadSitePage } from "@/data/load-site-page";
import { pageHead } from "@/data/seo";
import { SiteShell } from "@/components/site-shell";
import { PageArticle } from "@/components/page-article";
import { NotFoundPage } from "@/components/not-found";

export const Route = createFileRoute("/$")({
  validateSearch: (search: Record<string, unknown>) => ({
    age: typeof search.age === "string" ? search.age : undefined,
    city: typeof search.city === "string" ? search.city : undefined,
  }),
  loader: async ({ params }) => {
    const splat = [params._splat].flat().filter(Boolean).join("/");
    const data = await loadSitePage({ data: splat });
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
        signup={data.signup}
      />
    </SiteShell>
  );
}
