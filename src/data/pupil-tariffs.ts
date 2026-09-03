import type { CrmSlot } from "./crm-slots-core";
import type { CrmTariff } from "./crm-tariffs";
import { matchTariffs } from "./crm-tariffs";

export type PupilGroup = {
  key: string;
  groupId: number;
  branchId: number;
  name: string;
  school: string;
  course: string;
  age: string;
  teacher: string;
  taken: number;
  limit: number;
  subjectId: number;
};

export type PupilTariffItem = {
  customerId: number;
  name: string;
  status: string;
  groupId: number;
  branchId: number;
  groupName: string;
  school: string;
  tariffId: number;
  tariffName: string;
  price: number;
  periodCount: number;
  periodType: number;
  calcType: number;
  skip?: "no-tariff" | "already" | "lead";
};

export function uniqueLiveGroups(slots: CrmSlot[]): PupilGroup[] {
  const seen = new Set<string>();
  const out: PupilGroup[] = [];
  for (const s of slots) {
    if (!s.groupId || s.statusId === 3 || s.statusId === 4) continue;
    const key = `${s.branchId}:${s.groupId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      key,
      groupId: s.groupId,
      branchId: s.branchId,
      name: s.groupName || `группа ${s.groupId}`,
      school: s.school || "",
      course: s.course || s.subject || "",
      age: s.age || "",
      teacher: s.teacher || "",
      taken: Number(s.taken || 0),
      limit: Number(s.limit || 0),
      subjectId: Number(s.subjectId || 0),
    });
  }
  out.sort(
    (a, b) =>
      a.school.localeCompare(b.school, "ru") ||
      a.course.localeCompare(b.course, "ru") ||
      a.name.localeCompare(b.name, "ru"),
  );
  return out;
}

export function pickBestTariff(slot: Pick<CrmSlot, "subjectId" | "branchId" | "timeFrom" | "timeTo">, list: CrmTariff[]) {
  return matchTariffs(slot as CrmSlot, list)[0] || null;
}

export function pupilRowFromMember(
  m: { id: number; name: string; status: string; archived?: boolean },
  group: PupilGroup,
  tariff: CrmTariff | null,
  includeLeads: boolean,
): PupilTariffItem | null {
  if (!m.id) return null;
  if (m.archived || m.status === "архив") return null;
  if (m.status === "лид" && !includeLeads) return null;
  const skip = !tariff ? ("no-tariff" as const) : m.status === "лид" ? ("lead" as const) : undefined;
  return {
    customerId: m.id,
    name: m.name || `ученик ${m.id}`,
    status: m.status,
    groupId: group.groupId,
    branchId: group.branchId,
    groupName: group.name,
    school: group.school,
    tariffId: tariff?.id || 0,
    tariffName: tariff?.name || "",
    price: tariff?.price || 0,
    periodCount: tariff?.periodCount || 0,
    periodType: tariff?.periodType || 0,
    calcType: tariff && tariff.calculationType === 1 ? 0 : 1,
    skip,
  };
}

export function assignable(items: PupilTariffItem[]) {
  return items.filter((x) => x.tariffId && x.customerId && x.skip !== "no-tariff" && x.skip !== "already");
}

export function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
