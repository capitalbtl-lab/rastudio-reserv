import { packCustomerRegular, parseDossierRegular } from "./crm-regular-core";

export { packCustomerRegular, parseDossierRegular, regularDayLabel } from "./crm-regular-core";
export type { DiskRegular } from "./crm-regular-core";

export async function pullCustomerRegular(branchId: number, customerId: number) {
  const cid = Number(customerId) || 0;
  const branch = Number(branchId) || 1;
  if (!cid) return [];
  const { request, token } = await import("./alfacrm");
  const { loadTeachers } = await import("./crm-teachers");
  const { loadSubjects } = await import("./crm-subjects");
  const { stampDossierRegular } = await import("./dossiers");
  const t = await token();
  const json = await request<{ items?: Record<string, unknown>[] }>(
    `/v2api/${branch}/regular-lesson/index`,
    { page: 0, pageSize: 50, customer_id: cid },
    t,
  ).catch(() => ({ items: [] as Record<string, unknown>[] }));
  const teachers = new Map(loadTeachers().map((x) => [x.id, x.name]));
  const subjects = new Map(loadSubjects().map((x) => [x.id, x.name]));
  const rows = (json.items || [])
    .filter((it) => {
      const ids = Array.isArray(it.customer_ids) ? it.customer_ids.map(Number) : [];
      return !ids.length || ids.includes(cid);
    })
    .map((it) => {
      const teacherId = Array.isArray(it.teacher_ids) ? Number(it.teacher_ids[0] || 0) : Number(it.teacher_id || 0);
      const subjectId = Number(it.subject_id || 0);
      return packCustomerRegular(it, {
        branchId: Number(it.branch_id || branch) || branch,
        teacher: teachers.get(teacherId) || "",
        subject: subjects.get(subjectId) || "",
      });
    })
    .filter((x): x is NonNullable<typeof x> => Boolean(x));
  stampDossierRegular(cid, rows, branch);
  return rows;
}
