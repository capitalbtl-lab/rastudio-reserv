export type Who = "oleg" | "olga";

function genderFix(who: Who, text: string) {
  if (who === "oleg") {
    return text
      .replace(/\bсогласна\b/gi, "согласен")
      .replace(/\bготова\b/gi, "готов")
      .replace(/\bпоняла\b/gi, "понял")
      .replace(/\bрада\b/gi, "рад");
  }
  return text
    .replace(/\bсогласен\b/gi, "согласна")
    .replace(/\bготов\b(?!а)/gi, "готова")
    .replace(/\bпонял\b(?!а)/gi, "поняла")
    .replace(/\bрад\b(?!а)/gi, "рада");
}

export function parseTurns(raw: string): { who: Who; text: string }[] {
  const out: { who: Who; text: string }[] = [];
  let who: Who = "oleg";
  let buf: string[] = [];
  const flush = () => {
    const text = genderFix(who, buf.join(" ").trim());
    if (text) out.push({ who, text });
    buf = [];
  };
  for (const line of raw.replace(/\r/g, "").split("\n")) {
    const m = line.match(/^\s*(Олег|Ольга)\s*[:—-]\s*(.*)$/);
    if (m) {
      flush();
      who = m[1] === "Ольга" ? "olga" : "oleg";
      buf = [m[2]];
    } else if (line.trim()) {
      buf.push(line.trim());
    }
  }
  flush();
  return out.length ? out : [{ who: "oleg", text: raw.trim() }];
}

export function faceOf(who: Who, mood: "hello" | "think" | "happy" | "sorry") {
  if (who === "olga") {
    if (mood === "think") return "/brand/agent/olga-think.webp";
    if (mood === "happy") return "/brand/agent/olga-happy.webp";
    return "/brand/agent/olga.webp";
  }
  return "/brand/agent/oleg.webp";
}
