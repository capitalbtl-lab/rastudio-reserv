import { createFileRoute } from "@tanstack/react-router";
import { handleWebhook } from "@/data/agent-inbox";

function queryOf(url: string) {
  const out: Record<string, string> = {};
  try {
    const u = new URL(url);
    for (const [k, v] of u.searchParams) out[k] = v;
  } catch {
    /* */
  }
  return out;
}

function headersOf(request: Request) {
  const out: Record<string, string> = {};
  request.headers.forEach((v, k) => {
    out[k] = v;
  });
  return out;
}

async function bodyOf(request: Request) {
  const ctype = request.headers.get("content-type") || "";
  if (request.method === "GET" || request.method === "HEAD") return {};
  try {
    if (ctype.includes("json")) return await request.json();
  } catch {
    /* fall through */
  }
  const text = await request.text().catch(() => "");
  if (!text) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    if (ctype.includes("form") || text.includes("=")) {
      return Object.fromEntries(new URLSearchParams(text));
    }
    return { text };
  }
}

async function run(request: Request, channel: string) {
  const result = await handleWebhook({
    channel,
    method: request.method,
    query: queryOf(request.url),
    body: await bodyOf(request),
    headers: headersOf(request),
  });
  return new Response(result.text, {
    status: result.status,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

export const Route = createFileRoute("/api/agent/$channel")({
  server: {
    handlers: {
      GET: async ({ request, params }) => run(request, params.channel),
      POST: async ({ request, params }) => run(request, params.channel),
    },
  },
});
