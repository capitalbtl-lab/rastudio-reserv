import { DEFAULT_STATUS_PUBLISH, type StatusPublish } from "./group-status.ts";
export const ALFA_HOST = "https://studiyarazvivaysya.s20.online";
const TRIAL_CSS = encodeURIComponent("//cdn.alfacrm.pro/lead-form/form.css");

export const SITE_BRANCHES = [
  { id: 2, key: "cmit", label: "ЦМИТ · Октябрьской революции, 340" },
  { id: 1, key: "grazhd", label: "Коломна · Гражданская, 2" },
  { id: 3, key: "lukh", label: "Луховицы · Пушкина, 202А" },
  { id: 4, key: "leto", label: "Летние программы" },
] as const;

/** Форма 20 живёт в компании 2. Филиал 1/3/4 с /common/N/ форму не открывают. */
export function trialFormUrl(_branchId?: number) {
  return `${ALFA_HOST}/common/2/form/draw?id=20&lead_source_id=2&baseColor=205EDC&borderRadius=8&css=${TRIAL_CSS}`;
}

export function groupSignupUrl(branchId: number, gid: number | string) {
  const b = Number(branchId) || 2;
  const g = Number(gid) || 0;
  if (!g) return "";
  return `${ALFA_HOST}/common/${b}/lead/create?gid=${g}`;
}

export type SiteSignup = {
  /** Кнопки записи на сайте. Выкл — на сайте нет кнопок, только админка. */
  trialOn: boolean;
  groupOn: boolean;
  /** Ссылка формы пробного по филиалу (id 1–4). Пусто = шаблон trialFormUrl. */
  trialByBranch: Record<string, string>;
  /** По каждому status_id CRM: витрина / пробное / запись в группу. */
  statusPublish: Record<string, StatusPublish>;
};

export const SITE_SIGNUP_DEFAULT: SiteSignup = {
  trialOn: true,
  groupOn: true,
  trialByBranch: {
    "1": trialFormUrl(1),
    "2": trialFormUrl(2),
    "3": trialFormUrl(3),
    "4": trialFormUrl(4),
  },
  statusPublish: { ...DEFAULT_STATUS_PUBLISH },
};

/** Сток id=20 с /common/1|3|4/ — та же форма, компания 2. Чужой id не трогаем. */
export function normalizeTrialHref(href: string) {
  const s = String(href || "").trim();
  if (!s) return trialFormUrl();
  return s.replace(/\/common\/[134]\/form\/draw\?id=20(?=&|$)/, "/common/2/form/draw?id=20");
}

export function trialUrlFor(signup: SiteSignup, branchId?: number) {
  const id = String(Number(branchId) || 2);
  const raw = String(signup.trialByBranch?.[id] || "").trim() || trialFormUrl(Number(id));
  return normalizeTrialHref(raw);
}

export function resolveGroupSignup(opts: { signup?: string; branchId?: number; groupId?: number }) {
  const raw = String(opts.signup || "").trim();
  if (/^https?:\/\//i.test(raw)) return raw;
  return groupSignupUrl(Number(opts.branchId) || 0, Number(opts.groupId) || 0);
}
