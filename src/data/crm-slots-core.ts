export const SCHOOL_ORDER = [
  "Художественная школа",
  "Школа робототехники",
  "Школа программирования",
  "Школа наук и инженерии",
  "Школа раннего развития",
  "Школа иностранных языков",
  "Модельная школа",
  "Прочее",
];

export type LessonBeat = {
  day: number;
  timeFrom: string;
  timeTo: string;
  lessonId: number;
};

export type CrmSlot = {
  id: string;
  lessonId: number;
  groupId: number;
  groupName: string;
  groupNote: string;
  statusId: number;
  limit: number;
  taken: number;
  subjectId: number;
  subject: string;
  school: string;
  course: string;
  path: string;
  age: string;
  day: number;
  dayLabel: string;
  timeFrom: string;
  timeTo: string;
  timesPerWeek: number;
  beats?: LessonBeat[];
  branchId: number;
  city: string;
  branch: string;
  signup: string;
  teacherId: number;
  teacherIds: number[];
  teacher: string;
  roomId: number;
  bDate: string;
  eDate: string;
  hashtags?: string;
  makeup?: string;
  description?: string;
  remarks?: string;
  levelId?: number;
};

export type GroupCalLesson = {
  date: string;
  from: string;
  to: string;
  status: number;
  type: string;
};

export type SlotVersion = { at: string; reason: string; count: number; slots: CrmSlot[] };
