import type { SessionFacts } from "./agent-facts.ts";

/** Данные заявки второго ребёнка нельзя брать из открытой карточки первого. */
export function bookingIdentity(facts: SessionFacts, args: Record<string, unknown>) {
  if (facts.intent !== "второй") return { ok: true as const, args };
  if (!facts.secondChild || !facts.age || !facts.phone) {
    return { ok: false as const, error: "Для записи второго ребёнка уточните его имя, возраст и телефон родителя. Данные первого ребёнка не используйте." };
  }
  const child = String(args.child || "").trim();
  const hasSecondName = child.toLowerCase().split(/[\s,.-]+/).includes(facts.secondChild.toLowerCase());
  return {
    ok: true as const,
    args: { ...args, child: hasSecondName ? child : facts.secondChild, phone: facts.phone, age: facts.age, dob: "" },
  };
}
