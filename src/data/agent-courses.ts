import seed from "./prices.seed.json";
import { pickCoursePage, type CoursePageRow } from "./agent-course-page.ts";
import type { AgentTree } from "./agent-groups.ts";

const ROWS = seed as CoursePageRow[];

export function findCoursePage(query: string, tree?: AgentTree | null) {
  return pickCoursePage(query, ROWS, tree);
}

export function courseHint(text: string, tree?: AgentTree | null) {
  return findCoursePage(text, tree);
}
