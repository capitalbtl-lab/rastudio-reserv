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
  take?: number;
};

/** Клиент импортирует только это. Реализация с fs — динамический import на сервере. */
export const adminDisk = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as DiskReq)
  .handler(async ({ data }) => {
    try {
      const { handleAdminDisk } = await import("./admin-disk-run");
      return handleAdminDisk(data);
    } catch (e) {
      const raw = e instanceof Error ? e.message : "";
      const error = /502|504|ENOMEM|heap|out of memory/i.test(raw)
        ? "Кабинет перезапускается. Данные на сайте не пропали — повторите импорт через минуту."
        : raw || "Не удалось прочитать файл на сайте.";
      return { ok: false as const, error };
    }
  });
