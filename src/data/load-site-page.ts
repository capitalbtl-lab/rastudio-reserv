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
} from "./catalog.server";

export const loadSitePage = createServerFn({ method: "GET" })
  .validator((splat: unknown) => (typeof splat === "string" ? splat : undefined))
  .handler(async ({ data }) => {
    const page = getPage(data);
    if (!page) return null;
    const cmsCourse = getCmsCourse(data);
    const cmsMaster = getCmsMaster(data);
    return {
      page,
      teachers: page.kind === "team" || page.path === "/programming-school" ? allTeachers() : [],
      courses: page.kind === "catalog" ? allCourses() : [],
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
      schedule: scheduleFor(data),
    };
  });
