import { createServerFn } from "@tanstack/react-start";
import {
  allCmsCourses,
  allCmsMasters,
  allCourses,
  allPages,
  allTeachers,
  canonicalTrajectory,
  getCmsCourse,
  getCmsMaster,
  getPage,
  scheduleFor,
  allSchedule,
} from "./catalog.server";
import { sessionsFromCrm, filterCrmSessions } from "./alfacrm-schedule";
import { ensureLivePrices } from "./prices";

export const loadSitePage = createServerFn({ method: "GET" })
  .validator((splat: unknown) => (typeof splat === "string" ? splat : undefined))
  .handler(async ({ data }) => {
    ensureLivePrices();
    const page = getPage(data);
    if (!page) return null;
    const cmsCourse = getCmsCourse(data);
    const cmsMaster = getCmsMaster(data);
    return {
      page,
      teachers: page.kind === "team" || page.path === "/programming-school" ? allTeachers() : [],
      courses: allCourses(),
      masters:
        page.kind === "master-list"
          ? allPages()
              .filter((item) => item.kind === "master")
              .map((item) => ({ path: item.path, h1: item.h1 }))
          : [],
      cmsCourse: cmsCourse ?? null,
      cmsMaster: cmsMaster ?? null,
      cmsCourses: page.path === "/programming-school" || page.pathDecoded === "/programming-school" ? allCmsCourses() : [],
      cmsMasters: page.kind === "master-list" ? allCmsMasters() : [],
      trajectory: cmsCourse?.trajectory?.length
        ? cmsCourse.trajectory
        : page.path === "/programming-school"
          ? canonicalTrajectory()
          : [],
      schedule: await scheduleWithCrm(data),
    };
  });

async function scheduleWithCrm(splat?: string) {
  try {
    const crm = await sessionsFromCrm();
    const filtered = filterCrmSessions(crm, splat ? (splat.startsWith("/") ? splat : `/${splat}`) : splat);
    if (filtered.length) return filtered;
  } catch {
    /* CMS fallback */
  }
  return scheduleFor(splat);
}

export const loadFullSchedule = createServerFn({ method: "GET" }).handler(async () => {
  ensureLivePrices();
  try {
    const crm = await sessionsFromCrm();
    if (crm.length) return { sessions: crm };
  } catch {
    /* CMS fallback */
  }
  return { sessions: allSchedule() };
});
