export type CacheKind = "groups" | "customers" | "pupilTariffs" | "tariffCatalog" | "lessons" | "directory";

export type CacheRule = {
  cache: boolean;
  ttlMin: number;
};

export type CachePolicy = {
  at: string;
  overlayAt: string;
  overlayNext: number;
  overlayTotal: number;
  rules: Record<CacheKind, CacheRule>;
};

export const CACHE_KIND_META: { id: CacheKind; title: string; hint: string; liveHint: string }[] = [
  {
    id: "groups",
    title: "Состав групп",
    hint: "Кто в какой группе (cgi). Оперативные данные.",
    liveHint: "На лету при открытии группы. Кэш — список учеников с сайта.",
  },
  {
    id: "customers",
    title: "Клиенты и лиды",
    hint: "Карточки людей, статусы, телефоны.",
    liveHint: "Список из хранилища сайта, карточка — из CRM при открытии.",
  },
  {
    id: "pupilTariffs",
    title: "Абонементы учеников",
    hint: "У кого действующий абонемент сегодня. Для счётчика «с / без».",
    liveHint: "Кэш даёт счётчик сразу. Пакеты по 8 групп, абонементы филиала одним индексом. Незаконченный круг продолжается, а не сначала.",
  },
  {
    id: "tariffCatalog",
    title: "Каталог абонементов",
    hint: "Названия, цены, период. Почти не меняется.",
    liveHint: "Кэш уместен. Подтянуть — кнопка на вкладке Абонементы.",
  },
  {
    id: "lessons",
    title: "Занятия",
    hint: "Календарь группы, провести / отменить урок.",
    liveHint: "Оперативно, кэш короткий.",
  },
  {
    id: "directory",
    title: "Предметы, педагоги, аудитории",
    hint: "Справочники CRM.",
    liveHint: "Статика. Кэш уместен.",
  },
];

export const DEFAULT_CACHE_RULES: Record<CacheKind, CacheRule> = {
  groups: { cache: false, ttlMin: 10 },
  customers: { cache: true, ttlMin: 10 },
  pupilTariffs: { cache: true, ttlMin: 30 },
  tariffCatalog: { cache: true, ttlMin: 60 },
  lessons: { cache: false, ttlMin: 5 },
  directory: { cache: true, ttlMin: 60 },
};

/** Круг абонементов: не начинать с нуля, если уже дошли до overlayNext. Готово — только полный круг и свежий TTL. */
export function liveTariffsResume(opts: {
  overlayNext: number;
  overlayTotal: number;
  overlayAt: string;
  liveCount: number;
  cache: boolean;
  ttlMin: number;
  force?: boolean;
  now?: number;
}) {
  const finished = opts.overlayTotal > 0 && opts.overlayNext >= opts.overlayTotal;
  const t = Date.parse(opts.overlayAt);
  const fresh =
    opts.cache &&
    opts.liveCount > 0 &&
    Number.isFinite(t) &&
    t > 0 &&
    (opts.now || Date.now()) - t < opts.ttlMin * 60_000;
  const done = Boolean(!opts.force && fresh);
  return {
    done,
    next: Math.max(0, Number(opts.overlayNext) || 0),
    fromCache: true,
    finished,
  };
}
