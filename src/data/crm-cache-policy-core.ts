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
    liveHint: "Кэш даёт счётчик сразу. Обновление пакетами по 3 группы, как в мастере.",
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
