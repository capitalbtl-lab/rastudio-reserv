import { createFileRoute } from "@tanstack/react-router";
import { SiteShell } from "@/components/site-shell";
import { AdminPrices } from "@/components/admin-prices";
import { pageHead, SEO_ORIGIN } from "@/data/seo";

export const Route = createFileRoute("/admin")({
  head: () =>
    pageHead(
      {
        title: "Кабинет администратора | Студия «Развивайся»",
        description: "Кабинет администратора студии.",
        canonical: `${SEO_ORIGIN}/admin`,
        path: "/admin",
      },
      { noindex: true },
    ),
  component: AdminPage,
});

function AdminPage() {
  return (
    <SiteShell>
      <AdminPrices />
    </SiteShell>
  );
}
