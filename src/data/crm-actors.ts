/** Кто пишет на диск. Alfa догоняет очередью, актор не меняется. */

export type CrmActorId = "human" | "assistant" | "consultant" | "sync";

export type CrmActorKind = "human" | "ai" | "system";

export type CrmActor = {
  id: CrmActorId;
  name: string;
  kind: CrmActorKind;
  hint: string;
};

export const CRM_ACTORS: CrmActor[] = [
  { id: "human", name: "Сотрудник", kind: "human", hint: "Вход в кабинет одним паролем. Правки с экрана." },
  { id: "assistant", name: "ИИ-ассистент", kind: "ai", hint: "Чат в админке. Пишет диск, очередь помечает assistant." },
  { id: "consultant", name: "ИИ-консультант", kind: "ai", hint: "Виджет на сайте для родителя. Не кабинет." },
  { id: "sync", name: "Очередь Alfa", kind: "system", hint: "Пакеты cgi и выгрузка. Не человек и не ИИ." },
];

export type CrmActorsState = {
  humanName: string;
  actors: CrmActor[];
};

export function defaultActorsState(): CrmActorsState {
  return { humanName: "Администратор", actors: CRM_ACTORS.map((a) => ({ ...a })) };
}

export function actorOf(raw: unknown): CrmActorId {
  const s = String(raw || "").trim();
  if (s === "assistant" || s === "consultant" || s === "sync" || s === "human") return s;
  return "human";
}

export function actorLabel(id: CrmActorId, humanName = "Администратор") {
  if (id === "human") return humanName || "Сотрудник";
  return CRM_ACTORS.find((a) => a.id === id)?.name || id;
}
