export type CmsImage = {
  src: string;
  filename: string;
  alt?: string;
};

export type CmsModule = {
  id: string;
  courseName: string;
  title: string;
  order: number;
  color: string;
  textColor: string;
  image: CmsImage | null;
  bg: CmsImage | null;
  theses: string[];
};

export type CmsTrajectoryStep = {
  id: string;
  order: number;
  name: string;
  age: string;
  description: string[];
  courseName: string;
  bg1: CmsImage | null;
  bg2: CmsImage | null;
};

export type CmsCourse = {
  id: string;
  name: string;
  path: string;
  pathDecoded: string;
  age: string;
  program: string;
  logo: CmsImage | null;
  banner: CmsImage | null;
  gallery: CmsImage[];
  accent: string;
  audienceColor: string;
  audienceTextColor: string;
  formatColor: string | null;
  trajectoryColor: string;
  audienceBg: CmsImage | null;
  aboutTitle: string;
  aboutLead: string;
  aboutBody: string;
  aboutBody2: string;
  resultLevel: string;
  audienceTitle: string;
  audienceForTitle: string;
  audienceFor: string[];
  audienceSkillsTitle: string;
  audienceSkills: string[];
  audienceNote: string;
  programTitle: string;
  programText: string;
  modulesTitle: string;
  goalsTitle: string;
  goalsText: string;
  resultText: string[];
  resultImage: CmsImage | null;
  prospectsText: string[];
  prospectsImage: CmsImage | null;
  whyText: string[];
  whyImage: CmsImage | null;
  formatTitle: string;
  formatText1: string;
  formatText2: string;
  formatText3: string;
  trajectoryTitle: string;
  trajectoryText: string;
  modules: CmsModule[];
  trajectory: CmsTrajectoryStep[];
};

export type CmsSession = {
  id: string;
  group: string;
  age: string;
  when: string;
  teacherId: string;
  signup: string;
  city: string;
  branch: string;
  directionId: string;
  /** Legacy публичного расписания: String(subjectId). НЕ courseId дерева сайта. */
  courseId: string;
  ageTag: string;
  courseFilter: string;
  path?: string;
  teacher?: string;
  groupId?: number;
  branchId?: number;
  limit?: number;
  taken?: number;
  levelId?: number;
  level?: string;
  timeFrom?: string;
  timeTo?: string;
  day?: number;
  siteCourseId?: string;
  statusId?: number;
  priority?: number;
};

export type CmsMaster = {
  id: string;
  name: string;
  path: string;
  pathDecoded: string;
  short: string;
  image: CmsImage | null;
  ages: string[];
  sizes: string[];
  directions: string[];
  places: string[];
  long: string;
  whatHappens: string;
  learn: string;
  special: string;
  who: string;
  result: string;
  cta: string;
};

export type CmsPayload = {
  courses: CmsCourse[];
  canonicalTrajectory: CmsTrajectoryStep[];
  schedule: CmsSession[];
  masters: CmsMaster[];
  directions: { id: string; title: string }[];
  courseOrder: string[];
};

export function normPath(input: string) {
  let value = input.trim();
  if (!value.startsWith("/")) value = `/${value}`;
  if (value.length > 1) value = value.replace(/\/+$/, "");
  try {
    value = decodeURIComponent(value);
  } catch {
    /* keep */
  }
  return value.toLowerCase();
}

export const PROGRAM_SLUG: Record<string, string> = {
  START: "start",
  CREATE: "create-7",
  DEV: "dev",
  PYTHON: "python",
  GAMEDEV: "gamedev",
  "С++": "cpp",
};

export function courseKey(name: string) {
  if (/start/i.test(name)) return "start";
  if (/create/i.test(name)) return "create-7";
  if (/dev/i.test(name) && /лаборатор/i.test(name)) return "dev";
  if (/python/i.test(name)) return "python";
  if (/unity|gamedev/i.test(name)) return "gamedev";
  if (/с\+\+|c\+\+|си\+\+/i.test(name)) return "cpp";
  return name;
}

const PATH_FILTERS: { test: RegExp; filter: string }[] = [
  {
    test: /программирование-на-python|it-школа-программирование-на-python/i,
    filter: 'IT-Школа: "Программирование на Python с CodeBOOK"',
  },
  {
    test: /разработка-игр-на-unity|gamedev/i,
    filter: 'IT-Школа: "GameDev 4в1 - разработка игр на Unity"',
  },
  {
    test: /программирование-на-с|программирование-на-си/i,
    filter: 'IT-Школа: "Программирование на С++"',
  },
  {
    test: /лаборатория-dev|dev-для-детей-9/i,
    filter: 'IT-Лаборатория Dev: "Юный разработчик в сфере IT"',
  },
  {
    test: /лаборатория-create-для-детей-5-7|start/i,
    filter: 'IT-Лаборатория Start: "Первые шаги в мир цифры и STEAM"',
  },
  {
    test: /лаборатория-create-для-детей-7-9/i,
    filter: 'IT-Лаборатория Create: "Создатель игр и IT-проектов"',
  },
  { test: /roboticsinenglish|билингв/i, filter: "Билингвальная робототехника" },
  { test: /robototehnika|робототех/i, filter: "Робототехника" },
  { test: /english|английск|vitamin/i, filter: "Английский язык" },
  { test: /japanese|японск/i, filter: "Японский язык" },
  { test: /korean|корейск/i, filter: "Корейский язык" },
  { test: /radio|радиотех/i, filter: "Радиотехника" },
  { test: /tesla|physic|физик/i, filter: "Физика" },
  { test: /blender/i, filter: "Blender" },
  { test: /компас|3d-modeling|tinkercad/i, filter: "Компас" },
  { test: /беспилот|drone|авиац/i, filter: "Беспилотная авиация" },
  { test: /lego|happybricks|лего/i, filter: "Лего-курс" },
  { test: /digitalart|цифров/i, filter: "Цифровая ХШ" },
];

export function prettyCourseName(filter: string) {
  const n = (filter || "").replace(/\s+/g, " ").trim();
  if (!n) return "Курс";
  const known: Record<string, string> = {
    Робототехника: "Робототехника",
    "Билингвальная робототехника": "Робототехника на английском",
    "Английский язык": "Английский язык",
    "Японский язык": "Японский язык",
    "Корейский язык": "Корейский язык",
    Радиотехника: "Радиотехника",
    Физика: "Физика инноваций",
    Blender: "Blender и 3D-анимация",
    Компас: "Компас 3D",
    "Беспилотная авиация": "Беспилотная авиация",
    "Лего-курс": "Лего-математика",
    "Цифровая ХШ": "Цифровая художественная школа",
    "Академическая художественная школа": "Художественная школа 10–15 лет",
    "Художественная школа 9–13 лет": "Художественная школа 10–15 лет",
    "Художественная школа 9-13 лет": "Художественная школа 10–15 лет",
    "Подготовка в художественные ВУЗы": "Подготовка в художественные вузы",
    "Подготовка в художественные ВУЗы (от 14 лет)": "Подготовка в художественные вузы",
  };
  if (known[n]) return known[n];
  const quoted = n.match(/"([^"]+)"/);
  if (quoted) return quoted[1];
  return n;
}

const FILTER_HREF: Record<string, string> = {
  "Билингвальная робототехника": "/roboticsinenglish",
  "Японский язык": "/japanese",
  "Корейский язык": "/vitaminkorean",
  Радиотехника: "/radioengineering",
  Физика: "/teslaphysics",
  Blender: "/gamedesign",
  Компас: "/3d-modeling",
  "Лего-курс": "/happybricks",
  "Цифровая ХШ": "/digitalartschool",
  'IT-Школа: "Программирование на Python с CodeBOOK"':
    "/kursy-shkoly-programmirovaniya/it-школа-программирование-на-python",
  'IT-Школа: "Программирование на С++"':
    "/kursy-shkoly-programmirovaniya/it-школа-программирование-на-си",
  'IT-Школа: "GameDev 4в1 - разработка игр на Unity"':
    "/kursy-shkoly-programmirovaniya/it-школа-разработка-игр-на-unity",
  'IT-Лаборатория Create: "Создатель игр и IT-проектов"':
    "/kursy-shkoly-programmirovaniya/it-лаборатория-create-для-детей-7-9-лет",
  'IT-Лаборатория Start: "Первые шаги в мир цифры и STEAM"':
    "/kursy-shkoly-programmirovaniya/it-лаборатория-create-для-детей-5-7-лет",
  'IT-Лаборатория Dev: "Юный разработчик в сфере IT"':
    "/kursy-shkoly-programmirovaniya/it-лаборатория-dev-для-детей-9-10-лет",
};

export function hrefForCourseFilter(filter: string, age = "") {
  const n = (filter || "").replace(/\s+/g, " ").trim();
  if (n === "Робототехника") {
    if (/5\s*[-–]\s*[67]/.test(age)) return "/robototehnika-5-7";
    if (/7\s*[-–]\s*9/.test(age)) return "/robototehnika-7-9";
    return "/robototehnika-10-14";
  }
  if (n === "Английский язык") {
    if (/6\s*[-–]\s*8/.test(age)) return "/englishlanguagesm";
    return "/englishlanguagegg";
  }
  return FILTER_HREF[n] || null;
}

export function scheduleFilterForPath(path: string) {
  const decoded = normPath(path);
  const hit = PATH_FILTERS.find((item) => item.test.test(decoded));
  return hit?.filter ?? null;
}

export function inkOn(bg: string) {
  const light = new Set(
    ["#EEC51F", "#F0B000", "#6BDB03", "#C8A0BA", "#3FC5C5"].map((c) => c.toUpperCase()),
  );
  return light.has(bg.toUpperCase()) ? "#1A1612" : "#FFFFFF";
}
