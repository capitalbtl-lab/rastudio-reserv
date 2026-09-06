import { createFileRoute } from "@tanstack/react-router";
import { SiteShell } from "@/components/site-shell";
import { SITE } from "@/data/site";

export const Route = createFileRoute("/pay")({
  component: PayReturn,
  head: () => ({
    meta: [{ title: `Оплата — ${SITE.shortName}` }, { name: "robots", content: "noindex" }],
  }),
});

function PayReturn() {
  return (
    <SiteShell>
      <section className="mx-auto max-w-lg px-5 py-16 text-center">
        <p className="font-display text-3xl">Спасибо</p>
        <p className="mt-3 text-sm text-muted">
          Если оплата прошла, чек придёт от ЮKassa, а в Alfa касса подтянется сама — рассылки коллег сработают.
        </p>
        <p className="mt-2 text-sm text-muted">Если страница открылась до оплаты — вернитесь по ссылке из письма или напишите {SITE.phone}.</p>
        <a href="/" className="mt-8 inline-flex h-11 items-center rounded-full bg-primary px-5 text-sm font-semibold text-primary-fg">
          На главную
        </a>
      </section>
    </SiteShell>
  );
}
