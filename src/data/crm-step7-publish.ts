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
