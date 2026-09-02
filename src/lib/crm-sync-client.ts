import { adminLists } from "@/data/admin-lists";

function token() {
  if (typeof document === "undefined") return "";
  const m = document.cookie.match(/(?:^|;\s*)ra_admin=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : localStorage.getItem("ra_admin") || "";
}

export type SyncKind = "subjects" | "groups" | "tariffs" | "clients" | "prices" | "all";

export async function runCrmSync(
  kind: SyncKind,
  onStep?: (step: string, done: number, total: number) => void,
) {
  const tok = token();
  const start = await adminLists({ data: { token: tok, action: "sync", kind } });
  if (!start.ok) return start;
  const t0 = Date.now();
  while (Date.now() - t0 < 180000) {
    await new Promise((r) => window.setTimeout(r, 1500));
    const st = await adminLists({ data: { token: tok, action: "syncStatus" } });
    if (!st.ok) continue;
    const running = Boolean((st as { running?: boolean }).running);
    const step = String((st as { step?: string }).step || "");
    const done = Number((st as { done?: number }).done || 0);
    const total = Number((st as { total?: number }).total || 0);
    onStep?.(step, done, total);
    if (!running) return st;
  }
  return { ok: false as const, error: "AlfaCRM отвечает слишком долго. Список на сайте не трогали." };
}
