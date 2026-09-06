/** Вход действующего родителя: телефон с диска + подтверждение имени. Без OTP и без Alfa. */

export type IdentifyHit = {
  customerId: number;
  first: string;
  child: string;
};

export function childFirst(fio?: string, first?: string) {
  const n = String(first || "").trim();
  if (n) return n.split(/\s+/)[0];
  const parts = String(fio || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return parts[1];
  return parts[0] || "";
}

export function asIdentifyHits(
  rows: { crmId?: number; child?: { first?: string; fio?: string } }[],
): IdentifyHit[] {
  const out: IdentifyHit[] = [];
  const seen = new Set<number>();
  for (const d of rows) {
    const id = Number(d.crmId) || 0;
    if (!id || seen.has(id)) continue;
    const first = childFirst(d.child?.fio, d.child?.first);
    if (!first) continue;
    seen.add(id);
    out.push({ customerId: id, first, child: String(d.child?.fio || first) });
  }
  return out;
}

const YES = /^(да|ага|угу|верно|наш|так|это наш|это он|это она|да,\s*это|конечно|именно|она|он)\b/i;
const DENY = /другой ребёнок|это не (наш|он|она)|не наш ребёнок|подбираем впервые|подбираем курс впервые/i;

/** Запрос услуги после показа имени = подтверждение единственного ребёнка. Не переспрашивать. */
export const CLIENT_SERVICE_ASK =
  /отработк|пропуск|не прид|не сможем прийти|пауз|приостанов|абонемент|остат|когда следующее|расписан|правил|оферт|второго ребёнк|ещё одн(ого|у) ребёнк|индивидуальн|сверхурочн|дополнительн занят|во сколько|какой день ходим/i;

export function rejectIdentify(text: string) {
  return DENY.test(String(text || "").trim());
}

export function confirmedHit(
  hits: IdentifyHit[],
  user: string,
  assistant: string,
): IdentifyHit | null {
  if (!hits.length) return null;
  const text = String(user || "").trim();
  if (!text || rejectIdentify(text)) return null;
  const byName = hits.find((h) => text.toLowerCase().includes(h.first.toLowerCase()));
  if (byName) return byName;
  if (hits.length === 1 && /это ваш|нашл|ваш ребёнок|несколько детей/i.test(assistant) && YES.test(text)) return hits[0];
  if (hits.length === 1 && CLIENT_SERVICE_ASK.test(text) && !rejectIdentify(text)) return hits[0];
  return null;
}

export function impliedIdentify(hits: IdentifyHit[], lastUser: string, already?: boolean): IdentifyHit | null {
  if (!hits.length) return null;
  if (already && hits.length === 1) return hits[0];
  const u = String(lastUser || "").trim();
  if (!u || rejectIdentify(u)) return null;
  if (hits.length === 1 && CLIENT_SERVICE_ASK.test(u)) return hits[0];
  return null;
}

export function confirmedFromHistory(
  hits: IdentifyHit[],
  messages: { role: string; content: string }[],
): IdentifyHit | null {
  if (!hits.length) return null;
  let last: IdentifyHit | null = null;
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    if (m.role !== "user") continue;
    if (rejectIdentify(m.content)) {
      last = null;
      continue;
    }
    const prev = [...messages.slice(0, i)].reverse().find((x) => x.role === "assistant")?.content || "";
    const hit = confirmedHit(hits, m.content, prev);
    if (hit) last = hit;
  }
  return last;
}

export function identifyLocked(
  who: "oleg" | "olga",
  opts: { phone?: string; hits: IdentifyHit[]; identified?: boolean; lastUser?: string; lastAssistant?: string },
): { reply: string; chips: { label: string; send: string; primary?: boolean }[] } | null {
  const n = who === "olga" ? "Ольга" : "Олег";
  if (opts.identified) return null;
  if (!opts.phone) {
    return {
      reply: `${n}: Напишите телефон, который указывали при записи. По нему открою карточку на сайте.`,
      chips: [],
    };
  }
  if (!opts.hits.length) {
    return {
      reply: `${n}: По этому номеру на сайте никого нет. Проверьте телефон или подберём курс как в первый раз.`,
      chips: [
        { label: "Другой телефон", send: "Сейчас назову другой телефон" },
        { label: "Подбираем впервые", send: "Подбираем курс впервые", primary: true },
      ],
    };
  }
  const hit = confirmedHit(opts.hits, opts.lastUser || "", opts.lastAssistant || "");
  if (hit) return null;
  if (opts.hits.length === 1) {
    const h = opts.hits[0];
    return {
      reply: `${n}: ${who === "olga" ? "Нашла" : "Нашёл"} на сайте: ${h.first}. Это ваш ребёнок?`,
      chips: [
        { label: `Да, ${h.first}`, send: `Да, это ${h.first}`, primary: true },
        { label: "Другой ребёнок", send: "Это другой ребёнок" },
        { label: "Подбираем впервые", send: "Подбираем курс впервые" },
      ],
    };
  }
  return {
    reply: `${n}: На этом телефоне несколько детей. Нажмите имя или напишите, кого открыть.`,
    chips: opts.hits.slice(0, 6).map((h, i) => ({
      label: h.first,
      send: `Откройте карточку ${h.first}`,
      primary: i === 0,
    })),
  };
}
