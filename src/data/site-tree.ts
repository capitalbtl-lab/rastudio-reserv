import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { SCHOOLS, SCHOOL_COURSE_MATCH } from "./site";
import { listPriceRows, splitCourseAge, tidyCourseName } from "./prices-core";
import { schoolFromHay } from "./slot-mismatch";
import type { CrmSlot } from "./crm-slots-core";
import { groupAssignKey } from "./ids";

export type TreeSchool = { id: string; label: string; href: string };
export type TreeCourse = { id: string; schoolId: string; label: string; href: string; age: string };
export type SiteTree = { schools: TreeSchool[]; courses: TreeCourse[]; assign: Record<string, string> };

function fileOf() {
  return join(process.cwd(), "storage", "site-tree.json");
}

function prettyAge(age: string) {
  return String(age || "")
    .replace(/^Курс для (детей|девочек)\s*/i, "")
    .replace(/^Для детей\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function courseLabel(name: string, age: string) {
  const n = tidyCourseName(name) || String(name || "").trim();
  const a = prettyAge(age);
  if (!a) return n;
  if (n.toLowerCase().includes(a.toLowerCase().slice(0, 6))) return n;
  return `${n} · ${a}`;
}

export function slotTreeKey(s: { id?: string; groupId?: number; branchId?: number }) {
  return groupAssignKey(s);
}

function seed(): SiteTree {
  const schools: TreeSchool[] = SCHOOLS.map((s) => ({ id: s.href, label: s.label, href: s.href }));
  const courses: TreeCourse[] = [];
  const seen = new Set<string>();
  for (const r of listPriceRows()) {
    const href = r.path || "";
    if (!href || seen.has(href)) continue;
    const school =
      schools.find((s) => s.label === r.direction) ||
      schools.find((s) => s.href !== href && SCHOOL_COURSE_MATCH[s.href]?.(href));
    if (!school || school.href === href) continue;
    seen.add(href);
    courses.push({
      id: href,
      schoolId: school.id,
      label: courseLabel(r.name, r.age),
      href,
      age: prettyAge(r.age),
    });
  }
  return { schools, courses, assign: {} };
}

function merge(raw: Partial<SiteTree>): SiteTree {
  const base = seed();
  const schools = [...base.schools];
  for (const s of raw.schools || []) {
    if (!s?.id || !s.label) continue;
    const i = schools.findIndex((x) => x.id === s.id);
    if (i >= 0) schools[i] = { ...schools[i], ...s };
    else schools.push({ id: s.id, label: s.label, href: s.href || s.id });
  }
  const courses = [...base.courses];
  for (const c of raw.courses || []) {
    if (!c?.id || !c.label) continue;
    const i = courses.findIndex((x) => x.id === c.id);
    if (i >= 0) courses[i] = { ...courses[i], ...c };
    else courses.push({ id: c.id, schoolId: c.schoolId, label: c.label, href: c.href || "", age: c.age || "" });
  }
  const removed = new Set((raw as { removed?: string[] }).removed || []);
  return {
    schools: schools.filter((s) => !removed.has(s.id)),
    courses: courses.filter((c) => !removed.has(c.id) && schools.some((s) => s.id === c.schoolId)),
    assign: raw.assign && typeof raw.assign === "object" ? { ...raw.assign } : {},
  };
}

export function loadSiteTree(): SiteTree {
  try {
    if (!existsSync(fileOf())) return seed();
    return merge(JSON.parse(readFileSync(fileOf(), "utf8")) as Partial<SiteTree>);
  } catch {
    return seed();
  }
}

export function saveSiteTree(tree: SiteTree) {
  mkdirSync(dirname(fileOf()), { recursive: true });
  const next: SiteTree = {
    schools: tree.schools || [],
    courses: tree.courses || [],
    assign: tree.assign || {},
  };
  writeFileSync(fileOf(), JSON.stringify(next, null, 2));
  return next;
}

function ageNums(s: string) {
  const n: number[] = [];
  for (const m of String(s || "").matchAll(/(\d{1,2})/g)) {
    const v = Number(m[1]);
    if (v && v < 20) n.push(v);
  }
  return n;
}

function familyKey(s: string) {
  const t = String(s || "")
    .toLowerCase()
    .replace(/ё/g, "е");
  if (/билингв|на английск|roboticsinenglish/.test(t) && /робот|английск/.test(t)) return "robot-en";
  if (/робототех/.test(t)) return "robot";
  if (/digital|цифров/.test(t)) return "digital";
  if (/скульп/.test(t)) return "sculpt";
  if (/вуз|портрет/.test(t)) return "hudvuz";
  if (/художественн\w*\s*школ/.test(t) && !/студ/.test(t)) return "art-school";
  if (/художествен|студ/.test(t) && !/digital|цифров|скульп|вуз/.test(t)) return "art-studio";
  if (/python|питон|codebook/.test(t)) return "python";
  if (/scratch|startschool|старт скул/.test(t)) return "scratch";
  if (/start:|первые шаги/.test(t)) return "it-start";
  if (/create:|создатель игр/.test(t)) return "it-create";
  if (/dev:|юный разработчик/.test(t)) return "it-dev";
  if (/c\+\+|си\+\+/.test(t)) return "cpp";
  if (/unity|gamedev/.test(t)) return "gamedev";
  if (/лего|happybricks/.test(t)) return "lego";
  if (/steam|планет/.test(t)) return "steam";
  if (/подготовк.*школ|к школе готовы/.test(t)) return "prep";
  if (/go getter/.test(t)) return "english-gg";
  if (/super minds/.test(t)) return "english-sm";
  if (/коре|vitamin/.test(t)) return "korean";
  if (/япон|nihongo/.test(t)) return "japanese";
  if (/радио/.test(t)) return "radio";
  if (/физик|tesla/.test(t)) return "physics";
  if (/blender|game-дизайн/.test(t)) return "blender";
  if (/компас/.test(t)) return "compass";
  if (/киндер|kinder/.test(t)) return "kinder";
  if (/беспилот/.test(t)) return "drone";
  if (/модельн|подиум/.test(t)) return "model";
  if (/балн|танц|хорео|балет/.test(t)) return "dance";
  if (/наук|эксперимент/.test(t)) return "science";
  return tidyCourseName(s).toLowerCase().slice(0, 24);
}

export function ageFromGroup(s: { groupName?: string; subject?: string; age?: string }) {
  const pick = (t: string) => {
    const m = String(t || "").match(/(\d{1,2})\s*[-–—]\s*(\d{1,2})\s*(лет|года|год)?/i);
    if (m) return `${m[1]}-${m[2]} лет`;
    const o = String(t || "").match(/от\s*(\d{1,2})/i);
    if (o) return `от ${o[1]} лет`;
    const p = String(t || "").match(/\((\d{1,2})\s*\+\)/);
    if (p) return `от ${p[1]} лет`;
    return "";
  };
  return pick(s.groupName || "") || pick(s.subject || "") || pick(s.age || "") || String(s.age || "");
}

function bandOf(family: string, age: string) {
  const n = ageNums(age);
  if (!n.length) return "";
  const lo = Math.min(...n);
  if (family === "art-studio") {
    if (lo <= 4) return "3-4";
    if (lo <= 6) return "5-6";
    return "7-9";
  }
  if (family === "art-school") return "10-15";
  if (family === "robot") {
    if (lo <= 6) return "5-7";
    if (lo <= 8) return "7-9";
    return "9-14";
  }
  if (family === "robot-en") return "en";
  return String(lo);
}

function ageFit(groupAge: string, courseAge: string) {
  const g = ageNums(groupAge);
  const c = ageNums(courseAge);
  if (!g.length || !c.length) return 0;
  const glo = Math.min(...g);
  const ghi = Math.max(...g);
  const clo = Math.min(...c);
  const chi = Math.max(...c);
  const mid = (glo + ghi) / 2;
  if (mid >= clo - 0.4 && mid <= chi + 0.4) return 200 - (chi - clo) - Math.abs(mid - (clo + chi) / 2);
  const lo = Math.max(glo, clo);
  const hi = Math.min(ghi, chi);
  if (hi >= lo) return 30 + (hi - lo);
  const dist = mid < clo ? clo - mid : mid - chi;
  return Math.max(0, 10 - dist);
}

/** НЕ вызывать автоматически. Голосовой черновик → ID. Живые связи — courseId / assign. */
export function guessCourseId(s: CrmSlot, tree: SiteTree): string {
  const name = String(s.groupName || "");
  const hay = `${name} ${s.subject || ""}`.toLowerCase().replace(/ё/g, "е");
  const schoolLabel = s.school || schoolFromHay(`${name} ${s.subject} ${s.path}`);
  const school = tree.schools.find((x) => x.label === schoolLabel) || tree.schools.find((x) => x.id === s.path);
  const courses = school ? tree.courses.filter((c) => c.schoolId === school.id) : tree.courses;
  if (!courses.length) return "";
  const bilingual = /билингв|на английск/.test(name.toLowerCase().replace(/ё/g, "е"));
  const fam = bilingual ? "robot-en" : familyKey(name) || familyKey(hay);
  const siblings = courses.filter((c) => familyKey(c.label) === fam);
  const pool = siblings.length ? siblings : courses.filter((c) => familyKey(c.label) === familyKey(hay));
  const use = pool.length ? pool : courses;
  const age = ageFromGroup(s);
  const band = bandOf(fam, age);
  let best = "";
  let score = -1;
  for (const c of use) {
    let n = ageFit(age, `${c.age} ${c.label}`);
    const cBand = bandOf(familyKey(c.label), `${c.age} ${c.label}`);
    if (band && cBand && band === cBand) n += 80;
    if (siblings.length && familyKey(c.label) !== fam) n -= 400;
    if (fam !== "hudvuz" && familyKey(c.label) === "hudvuz") n -= 400;
    const cn = tidyCourseName(c.label).toLowerCase().replace(/ё/g, "е");
    const gn = tidyCourseName(name).toLowerCase().replace(/ё/g, "е");
    if (cn.length > 6 && gn.includes(cn.slice(0, 14))) n += 20;
    if (cn.length > 6 && cn.includes(gn.slice(0, 14))) n += 12;
    if (n > score) {
      score = n;
      best = c.id;
    }
  }
  if (score > 0) return best;
  if (use.length === 1) return use[0].id;
  return "";
}

/** courseId группы: assign[gid:branch:group] либо slot.courseId, если курс есть в дереве. Имя не смотрим. */
export function courseIdOf(s: CrmSlot, tree: SiteTree) {
  const key = slotTreeKey(s);
  const assigned = key ? tree.assign[key] : "";
  const id = assigned || s.courseId || "";
  return tree.courses.some((c) => c.id === id) ? id : "";
}

export function addTreeSchool(label: string, href?: string) {
  const tree = loadSiteTree();
  const id = (href || `/school-${Date.now()}`).replace(/\s+/g, "-");
  if (tree.schools.some((s) => s.id === id || s.label === label.trim())) return tree;
  tree.schools.push({ id, label: label.trim(), href: href || id });
  return saveSiteTree(tree);
}

export function addTreeCourse(schoolId: string, label: string, href?: string, age?: string) {
  const tree = loadSiteTree();
  const school = tree.schools.find((s) => s.id === schoolId);
  if (!school) return tree;
  const id = (href || `${schoolId}#${Date.now()}`).trim();
  tree.courses.push({
    id,
    schoolId,
    label: label.trim(),
    href: href || "",
    age: prettyAge(age || splitCourseAge(label).age),
  });
  return saveSiteTree(tree);
}

export function deleteTreeCourse(courseId: string) {
  const tree = loadSiteTree();
  tree.courses = tree.courses.filter((c) => c.id !== courseId);
  for (const k of Object.keys(tree.assign)) {
    if (tree.assign[k] === courseId) delete tree.assign[k];
  }
  return saveSiteTree(tree);
}

export function deleteTreeSchool(schoolId: string) {
  const tree = loadSiteTree();
  const ids = new Set(tree.courses.filter((c) => c.schoolId === schoolId).map((c) => c.id));
  tree.schools = tree.schools.filter((s) => s.id !== schoolId);
  tree.courses = tree.courses.filter((c) => c.schoolId !== schoolId);
  for (const k of Object.keys(tree.assign)) {
    if (ids.has(tree.assign[k])) delete tree.assign[k];
  }
  return saveSiteTree(tree);
}

export function pinAllGuesses(slots: CrmSlot[]) {
  const tree = loadSiteTree();
  let n = 0;
  for (const s of slots) {
    const key = slotTreeKey(s);
    const id = courseIdOf(s, tree);
    if (!id) continue;
    if (key && tree.assign[key] !== id) {
      tree.assign[key] = id;
      n += 1;
    }
    if (s.courseId !== id) {
      s.courseId = id;
      n += 1;
    }
    const hit = tree.courses.find((c) => c.id === id);
    if (hit && s.course !== hit.label) s.course = hit.label;
    const sch = hit ? tree.schools.find((x) => x.id === hit.schoolId) : undefined;
    if (sch) {
      if (s.school !== sch.label) s.school = sch.label;
      if (s.schoolId !== sch.id) {
        s.schoolId = sch.id;
        n += 1;
      }
    }
  }
  if (n) saveSiteTree(tree);
  return n;
}

export function moveSlotsToCourse(slots: CrmSlot[], ids: string[], courseId: string) {
  const tree = loadSiteTree();
  const course = tree.courses.find((c) => c.id === courseId);
  if (!course) return { tree, slots };
  const school = tree.schools.find((s) => s.id === course.schoolId);
  const want = new Set(ids);
  const next = slots.map((s) => {
    if (!want.has(s.id)) return s;
    const key = slotTreeKey(s);
    if (key) tree.assign[key] = course.id;
    return {
      ...s,
      courseId: course.id,
      schoolId: school?.id || s.schoolId,
      school: school?.label || s.school,
      course: course.label,
      path: course.href || s.path,
      age: s.age || course.age,
    };
  });
  return { tree: saveSiteTree(tree), slots: next };
}
