import { createFileRoute } from "@tanstack/react-router";
import { applyYooPayment } from "@/data/pay-online";

async function bodyOf(request: Request) {
  try {
    return await request.json();
  } catch {
    const text = await request.text().catch(() => "");
    try {
      return text ? JSON.parse(text) : {};
    } catch {
      return {};
    }
  }
}

export const Route = createFileRoute("/api/pay/yookassa")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const result = await applyYooPayment(await bodyOf(request));
        return Response.json(result, { status: result.ok ? 200 : 400 });
      },
      GET: async () => Response.json({ ok: true, hint: "Webhook ЮKassa: POST payment.succeeded" }),
    },
  },
});
