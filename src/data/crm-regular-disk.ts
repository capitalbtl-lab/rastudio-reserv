import { packCustomerRegular, parseDossierRegular, pickCustomerRegularItems } from "./crm-regular-core";
import { uniqueBranches } from "./crm-ledger-core";

export { packCustomerRegular, parseDossierRegular, regularDayLabel, pickCustomerRegularItems } from "./crm-regular-core";
export type { DiskRegular } from "./crm-regular-core";

export async function pullCustomerRegular(branchId: number, customerId: number) {
  const cid = Number(customerId) || 0;
  const branch = Number(branchId) || 1;
  if (!cid) return [];
  const { request, token } = await import("./alfacrm");
  const { loadTeachers } = await import("./crm-teachers");
  const { loadSubjects } = await import("./crm-subjects");
  const { stampDossierRegular, findDossier } = await import("./dossiers");
  const t = await token();
  const collected: Record<string, unknown>[] = [];
  for (const bid of uniqueBranches(branch)) {
    const json = await request<{ items?: Record<string, unknown>[] }>(
      `/v2api/${bid}/regular-lesson/index`,
      { page: 0, pageSize: 50, customer_id: cid },
      t,
    ).catch(() => ({ items: [] as Record<string, unknown>[] }));
    collected.push(...(json.items || []).map((it) => ({ ...it, branch_id: Number(it.branch_id || bid) || bid })));
  }
  let picked = pickCustomerRegularItems(collected, cid);
  if (picked.length < 2) {
    const d = findDossier({ crmId: cid });
    const gids = (d?.groupLinks || []).map((g) => Number(g.id) || 0).filter(Boolean).slice(0, 4);
    for (const gid of gids) {
      for (const bid of uniqueBranches(branch).slice(0, 2)) {
        const more = await request<{ items?: Record<string, unknown>[] }>(
          `/v2api/${bid}/regular-lesson/index`,
          { page: 0, pageSize: 50, related_id: gid },
          t,
        ).catch(() => ({ items: [] as Record<string, unknown>[] }));
        collected.push(...(more.items || []).map((it) => ({ ...it, branch_id: Number(it.branch_id || bid) || bid })));
      }
    }
    picked = pickCustomerRegularItems(collected, cid);
  }
  const teachers = new Map(loadTeachers().map((x) => [x.id, x.name]));
  const subjects = new Map(loadSubjects().map((x) => [x.id, x.name]));
  const d = findDossier({ crmId: cid });
  const groupName = (gid: number) => (d?.groupLinks || []).find((g) => g.id === gid)?.name || "";
  const rows = picked
    .map((it) => {
      const teacherId = Array.isArray(it.teacher_ids) ? Number(it.teacher_ids[0] || 0) : Number(it.teacher_id || 0);
      const subjectId = Number(it.subject_id || 0);
      const gid = Number(it.related_id || it.group_id || 0);
      return packCustomerRegular(it, {
        branchId: Number(it.branch_id || branch) || branch,
        teacher: teachers.get(teacherId) || "",
        subject: subjects.get(subjectId) || "",
        groupName: groupName(gid),
      });
    })
    .filter((x): x is NonNullable<typeof x> => Boolean(x));
  stampDossierRegular(cid, rows, branch);
  return rows;
}
