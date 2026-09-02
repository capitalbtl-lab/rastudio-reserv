import { createServerFn } from "@tanstack/react-start";

export type PullKind = "subjects" | "groups" | "tariffs" | "clients" | "clientsArchive" | "clientsLeads" | "prices";

export type PullLine = { ok: boolean; text: string };

export type DiskReq = {
  token?: string;
  action: "get" | "pull" | "pullStatus";
  kind?: PullKind;
  q?: string;
  status?: string;
  branchId?: number;
  ageBand?: string;
};

/** Клиент импортирует только это. Реализация с fs — динамический import на сервере. */
export const adminDisk = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as DiskReq)
  .handler(async ({ data }) => {
    const { handleAdminDisk } = await import("./admin-disk-run");
    return handleAdminDisk(data);
  });
