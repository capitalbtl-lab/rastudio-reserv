/** Старый сейв без skip/pause/типов занятий → живые значения, не undefined. */
export function mergeAgentSettings(raw?: Partial<AgentSettings> | null): AgentSettings {
  const incoming = raw || {};
  const s: AgentSettings = { ...DEFAULT_SETTINGS, ...incoming };
  if (incoming.defaultPartner !== "oleg" && incoming.defaultPartner !== "olga") s.defaultPartner = DEFAULT_SETTINGS.defaultPartner;
  if (incoming.style !== "short" && incoming.style !== "warm" && incoming.style !== "detailed") s.style = DEFAULT_SETTINGS.style;
  if (incoming.consultantCanSkip == null) s.consultantCanSkip = incoming.consultantCanJournal !== false;
  if (incoming.consultantCanPause == null) s.consultantCanPause = incoming.consultantCanJournal !== false;
  s.consultantCanJournal = s.consultantCanSkip !== false || s.consultantCanPause !== false;
  const bookDefault = s.consultantCanBook !== false;
  for (const f of BOOK_TYPE_FLAGS) {
    const id: BookTypeFlag = f.id;
    if (incoming[id] == null) s[id] = bookDefault;
  }
  return s;
}

/** Все флаги видимости false — битый сейв. Сайт остаётся без чата. */