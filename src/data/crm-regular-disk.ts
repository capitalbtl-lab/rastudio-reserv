import { packCustomerRegular, parseDossierRegular, pickCustomerRegularItems } from "./crm-regular-core";
import { uniqueBranches } from "./crm-ledger-core";

export { packCustomerRegular, parseDossierRegular, regularDayLabel, pickCustomerRegularItems } from "./crm-regular-core";
export type { DiskRegular } from "./crm-regular-core";

async function regularPages(
  request: (path: string, body: Record<string, unknown>, t: string) => Promise<{ items?: Record<string, unknown>[] }>,
  t: string,
  bid: number,
  extra: Record<string, unknown>,
) {
  const out: Record<string, unknown>[] = [];
  for (let page = 0; page < 8; page += 1) {
    const json = await request(`/v2api/${bid}/regular-lesson/index`, { page, pageSize: 50, ...extra }, t).catch(
      () => ({ items: [] as Record<string, unknown>[] }),
    );
    const items = json.items || [];
    out.push(...items.map((it) => ({ ...it, branch_id: Number(it.branch_id || bid) || bid })));
    if (items.length < 50) break;
  }
  return out;
}

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
  for (const bid of uniqueBranches(branch).slice(0, 2)) {
    collected.push(...(await regularPages(request, t, bid, { customer_id: cid })));
    collected.push(...(await regularPages(request, t, bid, { related_id: cid })));
  }
  const d0 = findDossier({ crmId: cid });
  const gids = (d0?.groupLinks || []).map((g) => Number(g.id) || 0).filter(Boolean).slice(0, 4);
  for (const gid of gids) {
    for (const bid of uniqueBranches(branch).slice(0, 2)) {
      collected.push(...(await regularPages(request, t, bid, { related_id: gid })));
    }
  }
  const picked = pickCustomerRegularItems(collected, cid);
  const teachers = new Map(loadTeachers().map((x) => [x.id, x.name]));
  const subjects = new Map(loadSubjects().map((x) => [x.id, x.name]));
  const d = findDossier({ crmId: cid });
  const groupName = (gid: number) => (d?.groupLinks || []).find((g) => g.id === gid)?.name || "";
  const fallbackGroupId = Number(d?.groupLinks?.[0]?.id || 0);
  const rows = picked
    .map((it) => {
      const teacherId = Array.isArray(it.teacher_ids) ? Number(it.teacher_ids[0] || 0) : Number(it.teacher_id || 0);
      const subjectId = Number(it.subject_id || 0);
      const gid = Number(it.group_id || it.groupId || it.related_id || 0);
      return packCustomerRegular(it, {
        branchId: Number(it.branch_id || branch) || branch,
        teacher: teachers.get(teacherId) || "",
        subject: subjects.get(subjectId) || "",
        groupName: groupName(gid === cid ? fallbackGroupId : gid),
        customerId: cid,
        fallbackGroupId,
      });
    })
    .filter((x): x is NonNullable<typeof x> => Boolean(x));
  stampDossierRegular(cid, rows, branch);
  return rows;
}
