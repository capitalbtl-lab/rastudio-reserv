/** Связь с AlfaCRM. Кабинет всегда читает диск. Режим решает, стучимся ли в Alfa. */

export type AlfaLinkMode = "linked" | "offline";

export const ALFA_LINK_MODES: {
  id: AlfaLinkMode;
  title: string;
  hint: string;
}[] = [
  {
    id: "linked",
    title: "С AlfaCRM",
    hint: "Правки сразу на сайте. Alfa получает их в фоне — рассылки и касса работают. «Обновить» подтягивает то, что коллеги внесли в Alfa.",
  },
  {
    id: "offline",
    title: "Без AlfaCRM",
    hint: "Работаем только на сайте. Правки копятся и уйдут в Alfa, когда включите связь снова.",
  },
];

export function alfaLinked(mode?: string | null) {
  return mode !== "offline";
}

export function alfaLinkOf(raw?: string | null): AlfaLinkMode {
  return raw === "offline" ? "offline" : "linked";
}
