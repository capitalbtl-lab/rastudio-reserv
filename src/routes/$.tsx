import { createFileRoute, notFound } from "@tanstack/react-router";
import { getPage } from "@/data/catalog";
import { pageHead } from "@/data/seo";
import { SiteShell } from "@/components/site-shell";
import { PageArticle } from "@/components/page-article";
import { PageLink } from "@/components/page-link";

export const Route = createFileRoute("/$")({
  loader: ({ params }) => {
    const page = getPage(params._splat);
    if (!page) throw notFound();
    return page;
  },
  head: ({ loaderData }) => (loaderData ? pageHead(loaderData) : { meta: [{ title: "Страница не найдена" }] }),
  component: CatchAll,
  notFoundComponent: NotFoundPage,
});

function CatchAll() {
  const page = Route.useLoaderData();
  return (
    <SiteShell>
      <PageArticle page={page} />
    </SiteShell>
  );
}

function NotFoundPage() {
  return (
    <SiteShell>
      <div className="mx-auto max-w-xl px-4 py-24 text-center">
        <p className="text-sm font-medium text-primary">404</p>
        <h1 className="display mt-3 text-4xl">Страница не найдена</h1>
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
