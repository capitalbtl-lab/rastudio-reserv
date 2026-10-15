/** Последний телефон относится к текущему входу, прежнее подтверждение не переносится. */
export type DialogMessage = { role: string; content: string };

const PHONE_RE = /(?<!\d)(?:(?:\+7|[78])[\s(.-]*\d{3}[\s).-]*\d{3}[\s.-]*\d{2}[\s.-]*\d{2}|9\d{2}[\s.-]*\d{3}[\s.-]*\d{2}[\s.-]*\d{2})(?!\d)/g;

export function withoutPhones(text: string) {
  return String(text || "").replace(PHONE_RE, " ");
}

export function phoneFromText(text: string) {
  const matches = [...String(text || "").matchAll(PHONE_RE)];
  let digits = (matches.at(-1)?.[0] || "").replace(/\D/g, "");
  if (digits.length === 10) digits = `7${digits}`;
  if (digits.startsWith("8")) digits = `7${digits.slice(1)}`;
  return digits.length === 11 ? `+${digits}` : "";
}

export function identityHistory(messages: DialogMessage[]) {
  let phone = "";
  let start = 0;
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    if (m.role !== "user") continue;
    const next = phoneFromText(m.content);
    if (/другой (?:телефон|номер)|телефон неверный|ошиб(?:ся|лась) номером/i.test(m.content)) {
      phone = "";
      start = i;
    }
    if (next && next !== phone) {
      phone = next;
      start = i;
    }
  }
  return { phone, messages: messages.slice(start) };
}
