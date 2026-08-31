import { createFileRoute } from "@tanstack/react-router";
import { SiteShell } from "@/components/site-shell";
import { AdminPrices } from "@/components/admin-prices";
import { pageHead, SEO_ORIGIN } from "@/data/seo";

export const Route = createFileRoute("/admin")({
  head: () =>
    pageHead({
      title: "Кабинет администратора | Студия «Развивайся»",
      description: "Цены курсов студии.",
      canonical: `${SEO_ORIGIN}/admin`,
      path: "/admin",
    }),
  component: AdminPage,
});

function AdminPage() {
  return (
    <SiteShell>
      <AdminPrices />
    </SiteShell>
  );
}
