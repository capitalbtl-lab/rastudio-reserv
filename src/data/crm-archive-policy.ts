/** Рабочий архив клиентов. Файл политики, не dossier.extras — синхронизация extras перетирает. */

import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { isPhoneLike } from "./client-display.ts";
import { pupilNameOk } from "./crm-slots-core.ts";
import { diskIsArchive } from "./crm-person-role.ts";

export type ArchivePolicyFilters = {
  fio: boolean;
  notAdult: boolean;
  noDob: boolean;
  hadGroups: boolean;
  attendYears: 0 | 1 | 2;
  ageFrom?: number;
  ageTo?: number;
};
export type ArchiveReason = "intersect" | "manual" | "left" | "catalog";

export type ArchivePolicy = {
  at: string;
  ready: boolean;
  filters: ArchivePolicyFilters;
  working: number[];
  manual: number[];
  reasons: Record<string, ArchiveReason>;
};

export type ArchivePerson = {
  cid: number;
  study: number;
  status?: string;
  removed?: string;
  fio: string;
  dob?: string;
  age?: number;
  groupLinks?: { id: number; branchId?: number }[];
  paidCount?: number;
  paidTill?: string;
  course?: string;
  lessons?: number;
  lastLessonAt?: number;
  funnel?: string;
};

export type ArchiveCountReport = {
  at: string;
  disk: number;
  clients: number;
  leadsSkip: number;
  fioOk: number;
  noDob: number;
  adult: number;
  hadGroups: number;
  working: number;
  hidden: number;
  kept: number;
  noPolicy?: boolean;
};

export const DEFAULT_ARCHIVE_FILTERS: ArchivePolicyFilters = {
  fio: true,
  notAdult: true,
  noDob: false,
  hadGroups: false,
  attendYears: 1,
};

let policyMem: { mtime: number; data: ArchivePolicy } | null = null;

function emptyPolicy(): ArchivePolicy {
  return { at: "", ready: false, filters: { ...DEFAULT_ARCHIVE_FILTERS }, working: [], manual: [], reasons: {} };
}

export function archivePolicyFile() {
  return join(process.cwd(), "storage", "crm-archive-policy.json");
}
