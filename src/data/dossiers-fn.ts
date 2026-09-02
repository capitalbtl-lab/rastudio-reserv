import { createServerFn } from "@tanstack/react-start";

export type DossiersReq = {
  token?: string;
  action?: "list" | "get" | "save" | "sync" | "syncAll" | "syncSlice" | "syncMembers" | "reclassify";
  id?: string;
  crmId?: number;
  branchId?: number;
  q?: string;
  isStudy?: number;
  page?: number;
  pages?: number;
  offset?: number;
  removed?: boolean;
  patch?: {
    childFio?: string;
    parentFio?: string;
    dob?: string;
    phone?: string;
    address?: string;
    city?: string;
    branch?: string;
    tariff?: string;
    status?: string;
  };
};

/** Клиент импортирует только это. Реализация с fs — динамический import на сервере. */
export const adminDossiers = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as DossiersReq)
  .handler(async ({ data }) => {
    const { handleAdminDossiers } = await import("./dossiers");
    return handleAdminDossiers(data);
  });
