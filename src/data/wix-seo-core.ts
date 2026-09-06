const HASH_FILE = /^[0-9a-f]{5,8}_[0-9a-f]{8,}/i;
const FILE_EXT = /\.(png|jpe?g|gif|webp)$/i;
const GENERIC_ALT = /empty-state|placeholder|image-empty|логотип(ы)? на главную/i;

export function normSeoTitle(value: string) {
  return String(value || "")
    .replace(/\u00a0/g, " ")
    .replace(/ё/gi, "е")
    .replace(/[«»"]/g, "")
    .replace(/\s*\|\s*rastudio\.org\s*$/i, "")
    .replace(/[\u200b\u200c\u200d]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function isInventedSeo(text: string) {
  const t = String(text || "").toLowerCase();
  if (!t) return true;
  return (
    /пробное занятие/.test(t) ||
    /лего, логика, конструирование/.test(t) ||
    /цвет, тон, техника/.test(t) ||
    /дефиле, позирование/.test(t) ||
    /личностный рост для девочек/.test(t) ||
    /макияж для девочек/.test(t)
  );
}

export function stripWixFile(value: string) {
  return String(value || "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .replace(FILE_EXT, "")
    .replace(/\s+\(\d+\)\s*$/, "")
    .trim();
}

/** Alt as written on Wix: keep the sentence, drop hash/filename junk. */
export function cleanWixAlt(alt?: string, filename?: string, fallback = "") {
  for (const raw of [alt, filename, fallback]) {
    const t = stripWixFile(raw || "");
    if (!t || t.length < 4 || HASH_FILE.test(t) || GENERIC_ALT.test(t)) continue;
    return t;
  }
  const last = stripWixFile(fallback || alt || filename || "");
  return last && !HASH_FILE.test(last) ? last : "Занятия в Студии Развивайся";
}

export function mediaIdFromSrc(src?: string) {
  const value = String(src || "");
  const wix = value.match(/\/media\/([^/?#]+)/i);
  if (wix) {
    try {
      return decodeURIComponent(wix[1]).replace(/_mv2\./, "~mv2.");
    } catch {
      return wix[1];
    }
  }
  const local = value.match(/\/imported\/([^/?#]+)/i);
  if (!local) return "";
  return local[1].replace(/_mv2\./, "~mv2.");
}
