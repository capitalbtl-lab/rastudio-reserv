import { createFileRoute } from "@tanstack/react-router";
import { deployHookOk, kickDeploy, readBuildStamp } from "@/data/admin-build";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });

export const Route = createFileRoute("/api/build")({
  server: {
    handlers: {
      GET: async () => json(readBuildStamp()),
      POST: async ({ request }) => {
        const token = request.headers.get("x-ra-deploy") || new URL(request.url).searchParams.get("token");
        if (!deployHookOk(token)) return json({ ok: false, error: "Нет права на выкладку." }, 403);
        const started = kickDeploy();
        return json({ ok: started, started });
      },
    },
  },
});
