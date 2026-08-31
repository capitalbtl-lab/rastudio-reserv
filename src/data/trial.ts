import { createServerFn } from "@tanstack/react-start";

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

export type TrialPayload = {
  parent: string;
  child: string;
  dob: string;
  phone: string;
  email: string;
  course: string;
  branch: string;
};

export const sendTrial = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as TrialPayload)
  .handler(async ({ data }) => {
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
    const body = {
      LeadForm: { id: 20, lead_source_id: 2 },
      LeadFormForm: {
        field1763751875: parent,
        field1763751902: child,
        field1763751955: dobRu,
        field1763751913: phone,
        field1763751923: email,
        field1763755924: branch,
        ...(data.course ? { field1763755942: data.course } : {}),
      },
    };
    try {
      const res = await fetch("https://studiyarazvivaysya.s20.online/v2api/2/lead-form/save?id=20", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as { success?: boolean; message?: string; errors?: unknown };
      if (json.success) return { ok: true as const };
      return { ok: false as const, error: json.message || "Не удалось отправить заявку. Позвоните нам." };
    } catch {
      return { ok: false as const, error: "Сеть недоступна. Позвоните 8 (800) 511-34-01." };
    }
  });
