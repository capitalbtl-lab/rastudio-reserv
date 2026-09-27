/** Совпавшая касса шага 7 попадает в рабочий архив сайта. Остальные туда не пишутся. */
import { addArchiveWorking } from "./crm-archive-policy";
import { upsertDossier } from "./dossiers";

export function publishStep7Working(card: { id: number; name?: string; dob?: string; branchId?: number; study?: number }) {
  const id = Number(card.id) || 0;
  if (!id) return;
  addArchiveWorking(id, "catalog");
  upsertDossier({
    crmId: id,
    branchId: card.branchId,
    child: String(card.name || ""),
    dob: String(card.dob || ""),
    status: "архив",
    source: "step7-cash",
    extras: { is_study: card.study === 0 ? "0" : "1", removed: "2" },
    byCrmOnly: true,
    quiet: true,
  });
}

export async function ensureStep7WorkingOnDisk() {
  const { peekStep7Board } = await import("./crm-leads");
  const { step6DiskAgrees } = await import("./crm-step5-canon");
  const { isArchiveWorking } = await import("./crm-archive-policy");
  const items = peekStep7Board()?.items || [];
  for (const card of items) {
    if (card.cashState !== "ok" || !step6DiskAgrees(card)) continue;
    if (isArchiveWorking(card.id)) continue;
    publishStep7Working(card);
  }
}
