import { adminDisk, type PullKind } from "@/data/admin-disk";

function token() {
  if (typeof document === "undefined") return "";
  const m = document.cookie.match(/(?:^|;\s*)ra_admin=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : localStorage.getItem("ra_admin") || "";
}

export async function loadFromDisk(kind: PullKind, extra: Record<string, unknown> = {}) {
  return adminDisk({ data: { token: token(), action: "get", kind, ...extra } });
}

export async function pullFromCrm(
  kind: PullKind,
  onStep?: (step: string, lines: { ok: boolean; text: string }[], done: number, total: number) => void,
) {
  const tok = token();
  const start = await adminDisk({ data: { token: tok, action: "pull", kind } });
  if (!start.ok) return start;
  const t0 = Date.now();
  while (Date.now() - t0 < 180000) {
    await new Promise((r) => window.setTimeout(r, 900));
    const st = await adminDisk({ data: { token: tok, action: "pullStatus" } });
    if (!st.ok) continue;
    const running = Boolean((st as { running?: boolean }).running);
    const step = String((st as { step?: string }).step || "");
    const lines = ((st as { lines?: { ok: boolean; text: string }[] }).lines || []) as { ok: boolean; text: string }[];
    const done = Number((st as { added?: number }).added || 0);
    const total = Number((st as { total?: number }).total || 0);
    onStep?.(step, lines, done, total);
    if (!running) return st;
  }
  return { ok: false as const, error: "AlfaCRM отвечает слишком долго. Данные на сайте не трогали." };
}
