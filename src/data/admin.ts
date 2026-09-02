import { createServerFn } from "@tanstack/react-start";
import { isAdminRequest, makeAdminToken } from "./admin-auth";
import {
  ensureLivePrices,
  listPriceRows,
  savePriceRows,
  updateGroupPrice,
  updateOnePrice,
  type PriceRow,
} from "./prices";
import {
  checkPassword,
  listAdminLog,
  loadAdminSettings,
  logAdmin,
  setAdminPassword,
  setCodeword,
} from "./admin-settings";

export const adminLogin = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as { password: string })
  .handler(async ({ data }) => {
    loadAdminSettings();
    if (!checkPassword(data.password || "")) {
      return { ok: false as const, error: "Неверный пароль." };
    }
    logAdmin("Вход в кабинет");
    return { ok: true as const, token: makeAdminToken(7 * 24 * 60 * 60 * 1000) };
  });

export const adminPrices = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as { token?: string })
  .handler(async ({ data }) => {
    if (!isAdminRequest(data.token)) return { ok: false as const, error: "Нужен вход администратора." };
    ensureLivePrices();
    return { ok: true as const, rows: listPriceRows() };
  });

export const adminGroupDurations = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as { token?: string })
  .handler(async ({ data }) => {
    if (!isAdminRequest(data.token)) return { ok: false as const, error: "Нужен вход администратора." };
    const { groupDurations } = await import("./price-from-groups");
    const pack = groupDurations();
    logAdmin(`Цены: подгрузка минут/недели из групп · ${pack.items.length} курсов, ${pack.groups} групп`);
    return { ok: true as const, ...pack };
  });

export const adminSavePrice = createServerFn({ method: "POST" })
  .validator(
    (data: unknown) =>
      data as { token?: string; path: string; all?: number; kbm?: number; tmx?: number; mins?: number; perWeek?: number },
  )
  .handler(async ({ data }) => {
    if (!isAdminRequest(data.token)) return { ok: false as const, error: "Нужен вход администратора." };
    const saved = updateOnePrice(data.path, {
      all: data.all,
      kbm: data.kbm,
      tmx: data.tmx,
      mins: data.mins,
      perWeek: data.perWeek,
    });
    if (saved.ok) logAdmin(`Цена: ${saved.row.name} → ${saved.row.all} ₽ · ${saved.row.mins || "—"} мин · ${saved.row.perWeek || "—"}/нед`);
    return saved;
  });

export const adminSaveGroup = createServerFn({ method: "POST" })
  .validator(
    (data: unknown) =>
      data as {
        token?: string;
        direction?: string;
        query?: string;
        field: string;
        set?: number;
        delta?: number;
      },
  )
  .handler(async ({ data }) => {
    if (!isAdminRequest(data.token)) return { ok: false as const, error: "Нужен вход администратора." };
    const saved = updateGroupPrice({
      direction: data.direction,
      query: data.query,
      field: data.field,
      set: data.set,
      delta: data.delta,
    });
    if (saved.ok) logAdmin(`Группа: ${data.direction || data.query} · ${saved.count} курсов`);
    return saved;
  });

export const adminSaveAll = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as { token?: string; rows: PriceRow[] })
  .handler(async ({ data }) => {
    if (!isAdminRequest(data.token)) return { ok: false as const, error: "Нужен вход администратора." };
    return { ok: true as const, rows: savePriceRows(data.rows || []) };
  });

export const adminMeta = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as { token?: string })
  .handler(async ({ data }) => {
    if (!isAdminRequest(data.token)) return { ok: false as const, error: "Нужен вход администратора." };
    loadAdminSettings();
    return { ok: true as const, token: makeAdminToken(7 * 24 * 60 * 60 * 1000), hasCodeword: true, log: listAdminLog() };
  });

export const adminSetCodeword = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as { token?: string; word: string })
  .handler(async ({ data }) => {
    if (!isAdminRequest(data.token)) return { ok: false as const, error: "Нужен вход администратора." };
    const saved = setCodeword(data.word || "");
    if (saved.ok) logAdmin("Сменено кодовое слово");
    return saved;
  });

export const adminSetPassword = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as { token?: string; password: string })
  .handler(async ({ data }) => {
    if (!isAdminRequest(data.token)) return { ok: false as const, error: "Нужен вход администратора." };
    const saved = setAdminPassword(data.password || "");
    if (saved.ok) logAdmin("Сменён пароль кабинета");
    return saved;
  });

export const adminEdits = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as { token?: string })
  .handler(async ({ data }) => {
    if (!isAdminRequest(data.token)) return { ok: false as const, error: "Нужен вход администратора." };
    const { listPageEdits } = await import("./edits");
    return { ok: true as const, edits: listPageEdits() };
  });

export const adminClearEdit = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as { token?: string; path: string; field: string })
  .handler(async ({ data }) => {
    if (!isAdminRequest(data.token)) return { ok: false as const, error: "Нужен вход администратора." };
    const { clearPageField } = await import("./edits");
    const saved = clearPageField(data.path, data.field);
    if (saved.ok) logAdmin(`Сброс текста: ${saved.path} · ${saved.field}`);
    return saved;
  });

export const adminVoice = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as { token?: string })
  .handler(async ({ data }) => {
    if (!isAdminRequest(data.token)) return { ok: false as const, error: "Нужен вход администратора." };
    const { loadVoiceSettings, MALE_VOICES, FEMALE_VOICES, VOICE_MOODS } = await import("./voice-settings");
    return {
      ok: true as const,
      settings: loadVoiceSettings(),
      male: [...MALE_VOICES],
      female: [...FEMALE_VOICES],
      roles: [...VOICE_MOODS],
    };
  });

export const adminSaveVoice = createServerFn({ method: "POST" })
  .validator(
    (data: unknown) =>
      data as {
        token?: string;
        oleg?: string;
        olga?: string;
        speed?: number;
        role?: string;
        mood?: string;
        pause?: number;
        olegSpeed?: number;
        olgaSpeed?: number;
        olegMood?: string;
        olgaMood?: string;
        olegVolume?: number;
        olgaVolume?: number;
        turnGap?: number;
        sampleOleg?: string;
        sampleOlga?: string;
      },
  )
  .handler(async ({ data }) => {
    if (!isAdminRequest(data.token)) return { ok: false as const, error: "Нужен вход администратора." };
    const { saveVoiceSettings } = await import("./voice-settings");
    const settings = saveVoiceSettings({
      oleg: data.oleg,
      olga: data.olga,
      speed: data.speed,
      role: data.mood || data.role,
      mood: data.mood || data.role,
      pause: data.pause,
      olegSpeed: data.olegSpeed,
      olgaSpeed: data.olgaSpeed,
      olegMood: data.olegMood,
      olgaMood: data.olgaMood,
      olegVolume: data.olegVolume,
      olgaVolume: data.olgaVolume,
      turnGap: data.turnGap,
      sampleOleg: data.sampleOleg,
      sampleOlga: data.sampleOlga,
    });
    logAdmin(`Голоса: Олег ${settings.oleg}/${settings.olegMood} ${settings.olegSpeed}, Ольга ${settings.olga}/${settings.olgaMood} ${settings.olgaSpeed}`);
    return { ok: true as const, settings };
  });

export const adminCalls = createServerFn({ method: "POST" })
  .validator(
    (data: unknown) =>
      data as {
        token?: string;
        action: "status" | "connect" | "scan" | "transcribe" | "knowledge" | "settings" | "toggle" | "list";
        userKey?: string;
        secret?: string;
        months?: number;
        settings?: {
          minSeconds?: number;
          scanHours?: number;
          paused?: boolean;
          autoKnowledge?: boolean;
          inject?: Record<string, boolean>;
        };
        kind?: string;
        index?: number;
        on?: boolean;
      },
  )
  .handler(async ({ data }) => {
    if (!isAdminRequest(data.token)) return { ok: false as const, error: "Нужен вход администратора." };
    const { callStats, connectNovofon, loadNovofonKeys, scanNovofon, transcribeBatch, buildKnowledge } = await import("./call-import");
    const { saveCallSettings, toggleKnowledge, listTranscripts, loadCallSettings } = await import("./call-knowledge");
    try {
      if (data.action === "connect") {
        if (!data.userKey || !data.secret) return { ok: false as const, error: "Нужны ключ и секрет Novofon." };
        connectNovofon({ userKey: data.userKey, secret: data.secret });
        logAdmin("Novofon: ключи сохранены");
        return { ok: true as const, connected: true, stats: callStats() };
      }
      if (data.action === "settings") {
        const settings = saveCallSettings(data.settings || {});
        logAdmin("Настройки базы звонков сохранены");
        return { ok: true as const, connected: true, stats: callStats(), settings };
      }
      if (data.action === "toggle") {
        const knowledge = toggleKnowledge(String(data.kind || ""), Number(data.index || 0), Boolean(data.on));
        return { ok: true as const, connected: true, stats: callStats(), knowledge };
      }
      if (data.action === "list") {
        return {
          ok: true as const,
          connected: Boolean(loadNovofonKeys()),
          stats: callStats(),
          transcripts: listTranscripts(50),
          settings: loadCallSettings(),
        };
      }
      if (data.action === "scan") {
        const stats = await scanNovofon(data.months || 24);
        logAdmin(`Novofon: найдено записей ${stats.total}`);
        return { ok: true as const, connected: true, stats };
      }
      if (data.action === "transcribe") {
        const stats = await transcribeBatch(8);
        logAdmin(`Расшифровка: ${stats.done} из ${stats.batch}, всего ${stats.transcribed}`);
        return { ok: true as const, connected: true, stats };
      }
      if (data.action === "knowledge") {
        const knowledge = await buildKnowledge();
        logAdmin(`База знаний: ${knowledge.faq.length} вопросов с ${knowledge.transcribed} звонков`);
        return { ok: true as const, connected: true, stats: callStats(), knowledge };
      }
      return { ok: true as const, connected: Boolean(loadNovofonKeys()), stats: callStats() };
    } catch (err) {
      const message = err instanceof Error ? err.message : "ошибка";
      if (message === "no-keys") return { ok: false as const, error: "Сначала сохраните ключи Novofon." };
      if (message === "no-transcripts") return { ok: false as const, error: "Сначала расшифруйте хотя бы несколько звонков." };
      return { ok: false as const, error: message.slice(0, 220) };
    }
  });
