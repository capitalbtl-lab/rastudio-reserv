import { createServerFn } from "@tanstack/react-start";
import { upsertAlfaLead } from "@/data/alfacrm";
import { trialCourseOptions, subjectIdOfCoursePath } from "@/data/site-bind-core";

export const TRIAL_BRANCHES = [
  { id: "2", name: "ЦМИТ · Коломна, Октябрьской революции, 340" },
  { id: "1", name: "Коломна · Гражданская, 2" },
  { id: "3", name: "Луховицы · Пушкина, 202А" },
  { id: "4", name: "Летние программы" },
] as const;

export const TRIAL_COURSES = trialCourseOptions().map((c) => ({ id: c.id, name: c.name }));

export function trialCourseForPath(path: string) {
  return subjectIdOfCoursePath(path);
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
};

function courseName(id: string) {
  return TRIAL_COURSES.find((c) => c.id === id)?.name || "";
}

function dobFromAge(age?: number) {
  const n = Number(age);
  if (!Number.isFinite(n) || n < 2 || n > 18) return "";
  return `01.09.${new Date().getFullYear() - Math.round(n)}`;
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
  const child = (data.child || "").trim() || "ребёнок";
  const phone = data.phone.trim();
  const email = (data.email || "").trim();
  const branch = data.branch.trim();
  if (!parent || !phone || !branch) {
    return { ok: false as const, error: "Нужны имя родителя, телефон и филиал." };
  }
  let dob = (data.dob || "").trim();
  if (!dob && data.age) dob = dobFromAge(data.age);
  const [y, m, d] = dob.split("-");
  const dobRu = d && m && y ? `${d}.${m}.${y}` : dob || dobFromAge(data.age);
  try {
    const saved = await upsertAlfaLead({
      parent,
      child,
      phone,
      email,
      dobRu,
      branchId: branch,
      courseName: courseName(data.course) || data.groupName || "",
      courseId: data.course,
      gid: data.gid,
      groupName: data.groupName,
      kind: data.kind || "trial",
      date: data.date,
      time: data.time,
      duration: data.duration,
    });
    return {
      ok: true as const,
      id: saved.id,
      duplicate: saved.duplicate,
      branch: saved.branch,
      url: saved.url,
      lesson: saved.lesson,
    };
  } catch (err) {
    console.error("saveTrialLead", err);
    try {
      const form = await saveLeadForm({
        parent,
        child,
        dobRu: dobRu || dobFromAge(data.age) || "01.09.2017",
        phone,
        email: email || `lead+${phone.replace(/\D/g, "").slice(-10)}@rastudio.org`,
        branch,
        course: data.course,
      });
      if (form.ok) return { ok: true as const, id: 0, duplicate: false, branch: Number(branch) || 2 };
      return form;
    } catch {
      return { ok: false as const, error: "Сеть недоступна. Позвоните 8 (800) 511-34-01." };
    }
  }
}

export const sendTrial = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as TrialPayload)
  .handler(async ({ data }) => saveTrialLead(data));
