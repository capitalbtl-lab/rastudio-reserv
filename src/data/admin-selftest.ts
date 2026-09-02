import { createServerFn } from "@tanstack/react-start";

export type CheckResult = {
  id: string;
  title: string;
  ok: boolean;
  skip?: boolean;
  detail: string;
  plain: string;
  fix: string;
  related: string[];
  raw: string;
  ms: number;
  leftover?: string;
};

export type SectionDef = {
  id: string;
  title: string;
  hint: string;
};

/** Клиент импортирует только это. Реализация с fs — динамический import на сервере. */
export const adminSelfTest = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as { token?: string; section?: string })
  .handler(async ({ data }) => {
    const { runAdminSelfTest } = await import("./admin-selftest-run");
    return runAdminSelfTest(data);
  });
