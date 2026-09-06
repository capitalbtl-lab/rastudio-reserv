import { serverEnv } from "./server-env";

export async function deepseekText(prompt: string, maxTokens = 800) {
  const key = serverEnv("DEEPSEEK_API_KEY");
  if (!key) throw new Error("Нет ключа DeepSeek. Кабинет → API.");
  const res = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    signal: AbortSignal.timeout(20000),
    body: JSON.stringify({
      model: "deepseek-chat",
      temperature: 0.5,
      max_tokens: maxTokens,
      messages: [
        {
          role: "system",
          content:
            "Ты редактор сайта студии «Развивайся» (Коломна, Луховицы). Пиши по-русски, коротко, без выдуманных цен и дат. Не обещай то, чего нет на rastudio.org.",
        },
        { role: "user", content: prompt.slice(0, 12000) },
      ],
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`DeepSeek ${res.status}: ${t.slice(0, 180)}`);
  }
  const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const text = String(json.choices?.[0]?.message?.content || "").trim();
  if (!text) throw new Error("DeepSeek вернул пустой ответ.");
  return text;
}

export function extractJson<T>(raw: string): T {
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fence ? fence[1] : raw;
  const start = body.indexOf("{") >= 0 && (body.indexOf("[") < 0 || body.indexOf("{") < body.indexOf("[")) ? body.indexOf("{") : body.indexOf("[");
  const end = body.lastIndexOf("]") > body.lastIndexOf("}") ? body.lastIndexOf("]") + 1 : body.lastIndexOf("}") + 1;
  if (start < 0 || end <= start) throw new Error("Модель не вернула JSON.");
  return JSON.parse(body.slice(start, end)) as T;
}
