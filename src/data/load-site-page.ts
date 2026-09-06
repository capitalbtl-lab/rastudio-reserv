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
import { ensureLivePrices } from "./prices";
import { ensureLiveEdits, snapshotEdits } from "./edits";
import { loadSiteSignup } from "./site-signup";
import { loadHomeLayout } from "./home-layout";
import { loadMediaAlts } from "./media-alts";

export const loadSitePage = createServerFn({ method: "POST" })
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
      edits: snapshotEdits(),
      signup: loadSiteSignup(),
    };
  });

async function scheduleWithCrm(splat?: string) {
  try {
    const { sessionsFromDisk, filterCrmSessions } = await import("./alfacrm-schedule");
    const filtered = filterCrmSessions(
      sessionsFromDisk(),
      splat ? (splat.startsWith("/") ? splat : `/${splat}`) : splat,
    );
    if (filtered.length) return filtered;
  } catch {
    /* CMS fallback */
  }
  return scheduleFor(splat);
}

export const loadFullSchedule = createServerFn({ method: "GET" }).handler(async () => {
  ensureLivePrices();
  try {
    const { sessionsFromDisk } = await import("./alfacrm-schedule");
    const crm = sessionsFromDisk();
    if (crm.length) return { sessions: crm };
  } catch {
    /* CMS fallback */
  }
  return { sessions: allSchedule() };
});

export const loadPublicEdits = createServerFn({ method: "GET" }).handler(async () => {
  ensureLiveEdits();
  loadMediaAlts();
  return { edits: snapshotEdits(), layout: loadHomeLayout() };
});
