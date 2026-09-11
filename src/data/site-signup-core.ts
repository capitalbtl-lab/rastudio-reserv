import { DEFAULT_STATUS_PUBLISH, type StatusPublish } from "./group-status.ts";
export const ALFA_HOST = "https://studiyarazvivaysya.s20.online";
const TRIAL_CSS = encodeURIComponent("//cdn.alfacrm.pro/lead-form/form.css");

export const SITE_BRANCHES = [
  { id: 2, key: "cmit", label: "ЦМИТ · Октябрьской революции, 340" },
  { id: 1, key: "grazhd", label: "Коломна · Гражданская, 2" },
  { id: 3, key: "lukh", label: "Луховицы · Пушкина, 202А" },
  { id: 4, key: "leto", label: "Летние программы" },
] as const;

export function trialFormUrl(_branchId?: number) {
  return `${ALFA_HOST}/common/2/form/draw?id=20&lead_source_id=2&baseColor=205EDC&borderRadius=8&css=${TRIAL_CSS}`;
}

export function trialIframeHtml(src?: string) {
  const href = (src || trialFormUrl()).replace(/"/g, "");
  const attr = href.replace(/&/g, "&");
  return `<iframe src="${attr}" width="100%" height="100%" frameborder="0"></iframe>`;
}

export function groupSignupUrl(branchId: number, gid: number | string) {
  const b = Number(branchId) || 2;
  const g = Number(gid) || 0;
  if (!g) return "";
  return `${ALFA_HOST}/common/${b}/lead/create?gid=${g}`;
}

export type SiteSignup = {
  trialOn: boolean;
  groupOn: boolean;
  /** iframe или URL формы пробного по филиалу. Запись в группу не использует. */
  trialByBranch: Record<string, string>;
  statusPublish: Record<string, StatusPublish>;
};

export const SITE_SIGNUP_DEFAULT: SiteSignup = {
  trialOn: true,
  groupOn: true,
  trialByBranch: {
    "1": trialIframeHtml(),
    "2": trialIframeHtml(),
    "3": trialIframeHtml(),
    "4": trialIframeHtml(),
  },
  statusPublish: { ...DEFAULT_STATUS_PUBLISH },
};

export function decodeTrialAttr(raw: string) {
  return String(raw || "")
    .replace(/&/g, "&")
    .replace(/"/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/</g, "<")
    .replace(/>/g, ">")
    .trim();
}

/** src из iframe или голый URL. */
export function parseTrialEmbed(raw: string) {
  const s = String(raw || "").trim();
  if (!s) return trialFormUrl();
  const tag = s.match(/<iframe\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/i);
  const href = decodeTrialAttr(tag ? tag[1] : s);
  const url = href.match(/https?:\/\/[^\s"'<>]+/i);
  return url ? url[0] : trialFormUrl();
}

export function normalizeTrialHref(href: string) {
  const s = String(href || "").trim();
  if (!s) return trialFormUrl();
  return s.replace(/\/common\/[134]\/form\/draw\?id=20(?=&|$)/, "/common/2/form/draw?id=20");
}

export function trialUrlFor(signup: SiteSignup, branchId?: number) {
  const id = String(Number(branchId) || 2);
  const raw = String(signup.trialByBranch?.[id] || "").trim() || trialIframeHtml();
  return normalizeTrialHref(parseTrialEmbed(raw));
}

export function openTrialForm(branchId?: number) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("ra-open-trial", { detail: { branchId: Number(branchId) || 2 } }));
}

export function resolveGroupSignup(opts: { signup?: string; branchId?: number; groupId?: number }) {
  const raw = String(opts.signup || "").trim();
  if (/^https?:\/\//i.test(raw)) return raw;
  return groupSignupUrl(Number(opts.branchId) || 0, Number(opts.groupId) || 0);
}
