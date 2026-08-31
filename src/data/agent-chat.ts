import { createServerFn } from "@tanstack/react-start";
import { SITE, BRANCHES, SCHOOLS } from "@/data/site";
import { coursePrice } from "@/data/ages";
import { saveTrialLead, TRIAL_BRANCHES, TRIAL_COURSES } from "@/data/trial";

const SYSTEM = `Ты — администратор студии «Развивайся» (Коломна и Луховицы). Говоришь по-русски, коротко, спокойно, как сотрудник сильной сети школ. Не называешь себя роботом или нейросетью. Не выдумываешь расписание на конкретный день и свободные места — их подтверждает администратор. Цены называй как «от … / 4 недели», точную группу не обещай.

Телефон: ${SITE.phone}. Сайт: ${SITE.domain}. Кабинет: ${SITE.cabinet}. VK: ${SITE.vk}. Telegram: ${SITE.telegram}.

Филиалы:
${BRANCHES.map((b) => `• ${b.city}, ${b.address}. ${b.hours}. ${b.note}`).join("\n")}
${TRIAL_BRANCHES.map((b) => `ID филиала для заявки: ${b.id} = ${b.name}`).join("\n")}

Школы и курсы (ссылки относительные, www.rastudio.org):
${SCHOOLS.map((s) => `• ${s.label} (${s.kicker}): ${s.blurb} → ${s.href}`).join("\n")}
${TRIAL_COURSES.map((c) => `• ${c.name} [course_id=${c.id}]`).join("\n")}
Ориентир по цене: ${coursePrice("/")} типичный абонемент от 3 350 ₽ / 4 нед. Художка 10–14 — 6 450 ₽. Пробное — без обязательства.

Задача: подобрать курс по возрасту и интересу, ответить про филиал и формат, затем записать на пробное.
Чтобы записать, собери: имя родителя, имя ребёнка, дата рождения (или год), телефон, email, филиал (id 1/2/3), курс (course_id). Спроси подтверждение «записать?» и только после явного согласия вызови submit_trial.
Если данных не хватает — спроси одно-два поля, не анкету стеной.
Жалобы, скидки, перевод между группами, возвраты — не решай: дай телефон и скажи, что передашь администратору.
Детям напрямую не пиши: собеседник — родитель.`;

const TOOLS = [
  {
    type: "function" as const,
    function: {
      name: "submit_trial",
      description:
        "Создать заявку на пробное занятие в AlfaCRM. Только после явного согласия родителя и при заполненных полях.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          parent: { type: "string", description: "Имя родителя" },
          child: { type: "string", description: "Имя ребёнка" },
          dob: { type: "string", description: "Дата рождения ДД.ММ.ГГГГ или ГГГГ-ММ-ДД" },
          phone: { type: "string" },
          email: { type: "string" },
          course_id: { type: "string", description: "ID курса из списка, например 37" },
          branch_id: { type: "string", description: "1 Гражданская, 2 Октябрьской революции, 3 Луховицы" },
        },
        required: ["parent", "child", "dob", "phone", "email", "branch_id"],
      },
    },
  },
];

type ChatMsg = { role: "user" | "assistant" | "system" | "tool"; content: string; tool_call_id?: string; tool_calls?: unknown };

const buckets = new Map<string, number[]>();

function limited(ip: string) {
  const now = Date.now();
  const windowMs = 60 * 60 * 1000;
  const prev = (buckets.get(ip) || []).filter((t) => now - t < windowMs);
  if (prev.length >= 40) {
    buckets.set(ip, prev);
    return true;
  }
  prev.push(now);
  buckets.set(ip, prev);
  return false;
}

function resolveCourse(id?: string) {
  if (!id) return "";
  const hit = TRIAL_COURSES.find((c) => c.id === String(id) || c.name.toLowerCase() === String(id).toLowerCase());
  return hit?.id || "";
}

function resolveBranch(id?: string) {
  if (!id) return "";
  const raw = String(id);
  const hit = TRIAL_BRANCHES.find(
    (b) => b.id === raw || b.name.toLowerCase().includes(raw.toLowerCase()) || raw.includes(b.id),
  );
  if (hit) return hit.id;
  if (/луховиц/i.test(raw)) return "3";
  if (/граждан/i.test(raw) || /олимп/i.test(raw)) return "1";
  if (/октябрь|цмит|340/i.test(raw)) return "2";
  return raw;
}

function normalizeDob(dob: string) {
  const s = dob.trim();
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return s;
  const ru = s.match(/^(\d{1,2})[.](\d{1,2})[.](\d{4})$/);
  if (ru) return `${ru[3]}-${ru[2].padStart(2, "0")}-${ru[1].padStart(2, "0")}`;
  const year = s.match(/^(19|20)\d{2}$/);
  if (year) return `${s}-09-01`;
  return s;
}

async function yandexChat(messages: ChatMsg[]) {
  const key = process.env.YANDEX_API_KEY?.trim();
  const folder = process.env.YANDEX_FOLDER_ID?.trim();
  if (!key || !folder) return null;
  const res = await fetch("https://ai.api.cloud.yandex.net/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Api-Key ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: `gpt://${folder}/yandexgpt/latest`,
      temperature: 0.3,
      max_tokens: 700,
      messages,
      tools: TOOLS,
      tool_choice: "auto",
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`yandex ${res.status} ${text.slice(0, 200)}`);
  }
  return (await res.json()) as {
    choices: { message: { role: string; content?: string | null; tool_calls?: { id: string; function: { name: string; arguments: string } }[] } }[];
  };
}

async function deepseekChat(messages: ChatMsg[]) {
  const key = process.env.DEEPSEEK_API_KEY?.trim();
  if (!key) return null;
  const res = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "deepseek-chat",
      temperature: 0.3,
      messages,
      tools: TOOLS,
      tool_choice: "auto",
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`deepseek ${res.status} ${text.slice(0, 200)}`);
  }
  return (await res.json()) as {
    choices: { message: { role: string; content?: string | null; tool_calls?: { id: string; function: { name: string; arguments: string } }[] } }[];
  };
}

async function complete(messages: ChatMsg[]) {
  try {
    const y = await yandexChat(messages);
    if (y) return y;
  } catch {
    /* fallback */
  }
  const d = await deepseekChat(messages);
  if (d) return d;
  throw new Error("no-key");
}

export const chatAgent = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as { messages: { role: "user" | "assistant"; content: string }[]; ip?: string })
  .handler(async ({ data }) => {
    const ip = data.ip || "anon";
    if (limited(ip)) {
      return { ok: false as const, error: "Слишком много сообщений. Позвоните 8 (800) 511-34-01." };
    }
    const trimmed = (data.messages || [])
      .filter((m) => m && (m.role === "user" || m.role === "assistant") && m.content)
      .slice(-16)
      .map((m) => ({ role: m.role, content: String(m.content).slice(0, 2000) }));
    if (!trimmed.length) return { ok: false as const, error: "Напишите вопрос." };

    const messages: ChatMsg[] = [{ role: "system", content: SYSTEM }, ...trimmed];
    try {
      for (let step = 0; step < 3; step++) {
        const json = await complete(messages);
        const msg = json.choices?.[0]?.message;
        if (!msg) break;
        if (msg.tool_calls?.length) {
          messages.push({
            role: "assistant",
            content: msg.content || "",
            tool_calls: msg.tool_calls,
          } as ChatMsg);
          for (const call of msg.tool_calls) {
            let args: Record<string, string> = {};
            try {
              args = JSON.parse(call.function.arguments || "{}");
            } catch {
              args = {};
            }
            if (call.function.name === "submit_trial") {
              const saved = await saveTrialLead({
                parent: args.parent || "",
                child: args.child || "",
                dob: normalizeDob(args.dob || ""),
                phone: args.phone || "",
                email: args.email || "",
                course: resolveCourse(args.course_id),
                branch: resolveBranch(args.branch_id),
              });
              messages.push({
                role: "tool",
                tool_call_id: call.id,
                content: saved.ok
                  ? "Заявка принята. Администратор свяжется для подтверждения времени."
                  : `Ошибка: ${saved.error}`,
              });
            } else {
              messages.push({ role: "tool", tool_call_id: call.id, content: "Неизвестное действие." });
            }
          }
          continue;
        }
        const reply = (msg.content || "").trim();
        if (reply) return { ok: true as const, reply };
      }
      return {
        ok: true as const,
        reply: "Передам администратору. Или сразу звоните 8 (800) 511-34-01.",
      };
    } catch (err) {
      const reason = err instanceof Error ? err.message : "";
      if (reason === "no-key") {
        return { ok: false as const, error: "Напишите нам в Telegram или позвоните 8 (800) 511-34-01." };
      }
      return { ok: false as const, error: "Сейчас не отвечаю. Позвоните 8 (800) 511-34-01." };
    }
  });
