import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { HomeEditorPage } from "@/components/home-editor";
import { staffToken } from "@/components/home-edit-boot";
import { loadPublicEdits } from "@/data/load-site-page";
import { pageHead, SEO_ORIGIN } from "@/data/seo";
import type { HomeLayoutDoc } from "@/data/home-layout-core";

export const Route = createFileRoute("/edit")({
  ssr: false,
  loader: () => loadPublicEdits(),
  head: () =>
    pageHead(
      {
        title: "Редактор сайта | Студия «Развивайся»",
        description: "Вёрстка rastudio.org. На публичный сайт уходит только сохранённый макет.",
        canonical: `${SEO_ORIGIN}/edit`,
        path: "/edit",
      },
      { noindex: true },
    ),
  component: EditPage,
});

function EditPage() {
  const data = Route.useLoaderData() as { layout?: HomeLayoutDoc };
  useEffect(() => {
    let token = "";
    try {
      token = staffToken() || sessionStorage.getItem("ra_debug") || "";
    } catch {
      token = "";
    }
    if (!token) location.replace("/");
  }, []);
  return <HomeEditorPage initial={data?.layout} />;
}
