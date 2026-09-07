/** Ядро. Вкладки B–E читают, не правят. Новый ключ — сначала сюда. */

export { DISK_RULES, diskRuleOf, type DiskRule } from "./crm-disk-rules.ts";
export {
  isLocalId,
  isCrmId,
  isLocalSubject,
  nextLocalId,
} from "./crm-local-id.ts";

export const KERNEL_KEYS = [
  "branchId",
  "groupId",
  "customerId",
  "tariffId",
  "subjectId",
  "courseId",
  "schoolId",
  "lessonId",
] as const;

export const KERNEL_FILES = [
  "src/data/ids.ts",
  "src/data/kernel.ts",
  "src/data/crm-disk-rules.ts",
  "src/data/crm-local-id.ts",
  "src/data/crm-export-queue.ts",
  "src/data/crm-export-queue-core.ts",
  "src/data/crm-packet-queue.ts",
  "src/data/crm-packet-queue-core.ts",
  "src/data/crm-inbound-core.ts",
  "src/data/crm-night-groups.ts",
  "src/data/crm-pay-core.ts",
  "src/data/crm-alfa-link-core.ts",
  "src/data/dossiers.ts",
  "src/data/customer-card-disk.ts",
  "src/data/schedule-map.ts",
  "src/data/tariff-map.ts",
  "src/data/public-bind.ts",
  "src/data/public-bind-core.ts",
] as const;
