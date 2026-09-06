import { createFileRoute } from "@tanstack/react-router";
import { StaffShell } from "@/components/staff-shell";
import { AdminPrices } from "@/components/admin-prices";
import { pageHead, SEO_ORIGIN } from "@/data/seo";
import { AppErrorComponent } from "@/lib/error-component";

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
  errorComponent: AppErrorComponent,
  component: AdminPage,
});

function AdminPage() {
  return (
    <StaffShell>
      <AdminPrices />
    </StaffShell>
  );
}
