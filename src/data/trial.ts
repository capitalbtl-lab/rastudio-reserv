import { createServerFn } from "@tanstack/react-start";
import { upsertAlfaLead } from "@/data/alfacrm";

export const TRIAL_BRANCHES = [
  { id: "2", name: "Коломна · Октябрьской революции, 340" },
  { id: "1", name: "Коломна · Гражданская, 2" },
  { id: "3", name: "Луховицы · Пушкина, 202А" },
] as const;

export const TRIAL_COURSES = [
  { id: "12", name: "Художественная студия 3–4 года" },
  { id: "13", name: "Художественная студия 5–6 лет" },
  { id: "14", name: "Художественная студия 7–9 лет" },
  { id: "92", name: "Художественная школа 10–14 лет" },
  { id: "11", name: "Скульптурная студия" },
  { id: "5", name: "Подготовка в художественные вузы" },
  { id: "97", name: "Основы цифрового рисунка" },
  { id: "36", name: "Робототехника 5–6 лет" },
  { id: "37", name: "Робототехника 7–9 лет" },
  { id: "35", name: "Робототехника 9–14 лет" },
  { id: "114", name: "Робототехника на английском" },
  { id: "43", name: "StartSchool: программирование в Scratch" },
  { id: "98", name: "IT-лаборатория Create" },
  { id: "15", name: "JuniorSchool: программирование 3в1" },
  { id: "46", name: "Программирование на Python" },
  { id: "48", name: "Программирование на C++" },
  { id: "52", name: "GameDev 4в1 — Unity" },
  { id: "107", name: "Game-дизайн и 3D-анимация в Blender" },
  { id: "39", name: "Инженерное 3D-моделирование в Компас" },
  { id: "27", name: "Увлекательная наука" },
  { id: "89", name: "Физика инноваций" },
  { id: "67", name: "Радиотехника" },
  { id: "25", name: "Беспилотная авиация" },
  { id: "16", name: "Подготовка к школе" },
  { id: "108", name: "Лего-математика" },
  { id: "4", name: "Модельная школа" },
  { id: "110", name: "Английский Super Minds" },
  { id: "111", name: "Английский Go Getter" },
  { id: "112", name: "Корейский язык" },
  { id: "113", name: "Японский язык" },
] as const;

const COURSE_BY_PATH: { test: RegExp; id: string }[] = [
  { test: /art-studio-3-4/, id: "12" },
  { test: /art-studio-5-6/, id: "13" },
  { test: /art-studio-7-8/, id: "14" },
  { test: /art-studio-9-13/, id: "92" },
  { test: /sculptural/, id: "11" },
  { test: /hudvuz/, id: "5" },
  { test: /digitalart/, id: "97" },
  { test: /robototehnika-5/, id: "36" },
  { test: /robototehnika-7/, id: "37" },
  { test: /robototehnika-10/, id: "35" },
  { test: /roboticsinenglish/, id: "114" },
  { test: /create-для-детей-5-7|startschool|scratch/i, id: "43" },
  { test: /create-для-детей-7-9/, id: "98" },
  { test: /dev-для-детей|juniorschool/i, id: "15" },
  { test: /python/, id: "46" },
  { test: /программирование-на-с|си\+\+|c\+\+/i, id: "48" },
  { test: /unity|gamedev/i, id: "52" },
  { test: /blender|gamedesign/, id: "107" },
  { test: /3d-modeling|компас/, id: "39" },
  { test: /science-course/, id: "27" },
  { test: /tesla/, id: "89" },
  { test: /radio/, id: "67" },
  { test: /беспилот|drone/, id: "25" },
  { test: /preparation-for-school/, id: "16" },
  { test: /happybricks/, id: "108" },
  { test: /model-school/, id: "4" },
  { test: /englishlanguagesm|super minds/i, id: "110" },
  { test: /englishlanguagegg|go getter/i, id: "111" },
  { test: /vitamin|korean/, id: "112" },
  { test: /japanese/, id: "113" },
];

export function trialCourseForPath(path: string) {
  const hit = COURSE_BY_PATH.find((item) => item.test.test(path));
  return hit?.id ?? "";
}

export type TrialPayload = {
  parent: string;
  child: string;
  dob: string;
  phone: string;
  email: string;
  course: string;
  branch: string;
};

function courseName(id: string) {
  return TRIAL_COURSES.find((c) => c.id === id)?.name || "";
}

async function saveLeadForm(data: {
  parent: string;
  child: string;
  dobRu: string;
  phone: string;
  email: string;
  branch: string;
  course: string;
}) {
  const body = {
    LeadForm: { id: 20, lead_source_id: 2 },
    LeadFormForm: {
      field1763751875: data.parent,
      field1763751902: data.child,
      field1763751955: data.dobRu,
      field1763751913: data.phone,
      field1763751923: data.email,
      field1763755924: data.branch,
      ...(data.course ? { field1763755942: data.course } : {}),
    },
  };
  const res = await fetch("https://studiyarazvivaysya.s20.online/v2api/2/lead-form/save?id=20", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as { success?: boolean; message?: string };
  if (json.success) return { ok: true as const };
  return { ok: false as const, error: json.message || "Не удалось отправить заявку. Позвоните нам." };
}

export async function saveTrialLead(data: TrialPayload) {
  const parent = data.parent.trim();
  const child = data.child.trim();
  const phone = data.phone.trim();
  const email = data.email.trim();
  const dob = data.dob.trim();
  const branch = data.branch.trim();
  if (!parent || !child || !phone || !email || !dob || !branch) {
    return { ok: false as const, error: "Заполните все обязательные поля." };
  }
  const [y, m, d] = dob.split("-");
  const dobRu = d && m && y ? `${d}.${m}.${y}` : dob;
  try {
    await upsertAlfaLead({
      parent,
      child,
      phone,
      email,
      dobRu,
      branchId: branch,
      courseName: courseName(data.course),
    });
    return { ok: true as const };
  } catch {
    try {
      return await saveLeadForm({ parent, child, dobRu, phone, email, branch, course: data.course });
    } catch {
      return { ok: false as const, error: "Сеть недоступна. Позвоните 8 (800) 511-34-01." };
    }
  }
}

export const sendTrial = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as TrialPayload)
  .handler(async ({ data }) => saveTrialLead(data));
