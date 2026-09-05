/** Константы формы записи: клиент и сервер, без AlfaCRM. */
import { trialCourseOptions, courseIdOfPath } from "./site-bind-core";

export const TRIAL_BRANCHES = [
  { id: "2", name: "ЦМИТ · Коломна, Октябрьской революции, 340" },
  { id: "1", name: "Коломна · Гражданская, 2" },
  { id: "3", name: "Луховицы · Пушкина, 202А" },
  { id: "4", name: "Летние программы" },
] as const;

export const TRIAL_COURSES = trialCourseOptions().map((c) => ({ id: c.id, name: c.name }));

export function trialCourseForPath(path: string) {
  return courseIdOfPath(path);
}

export type TrialPayload = {
  parent: string;
  child: string;
  dob: string;
  phone: string;
  email: string;
  course: string;
  branch: string;
  gid?: string;
  groupName?: string;
  age?: number;
  kind?: string;
  date?: string;
  time?: string;
  duration?: number;
  subjectId?: number;
};
