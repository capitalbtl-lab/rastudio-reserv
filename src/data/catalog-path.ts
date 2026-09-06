import { normPath } from "./cms";

export function lastPathSlug(path: string) {
  return normPath(path).split("/").filter(Boolean).pop() || "";
}

/** Ключи поиска страницы: как в URL, раскодированный, нижний регистр. */
export function pageLookupKeys(splat: string) {
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (value: string) => {
    const n = normPath(value);
    if (!n || n === "/" || seen.has(n)) return;
    seen.add(n);
    out.push(n);
  };
  let cur = String(splat || "").trim();
  if (!cur) return out;
  push(cur);
  for (let i = 0; i < 3; i += 1) {
    try {
      const next = decodeURIComponent(cur);
      if (next === cur) break;
      cur = next;
      push(cur);
    } catch {
      break;
    }
  }
  return out;
}
