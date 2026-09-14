# ТЗ · ядро · 03f — всё по lessonId, готово только id + счёт

Себе. Пока не код. Сказать «делай» — шаг 2 и шаг 3 в этом файле, одним заходом ядра.
Не подменяет 03a/03b/03d. Уточняет окно синей относительно 03e: **±N**, не только прошлое.
Экран D не трогать. Подписи карточек — сказать человеку.

## Зачем

Длина совпала, наборы разные — уже ловили (касса Адильхановой, жёлтые с +0).
Один checksum без id — тот же класс дыры.
Нужно **оба** условия сразу:

```
набор lessonId диска окна === набор lessonId Alfa окна
И
сколько уникальных id на диске === сколько уникальных id в переписи
И
сколько строк с lessonId>0 на диске === сколько уникальных id на диске
```

Первое — кто. Второе — сколько. Третье — нет двух строк на один id.

Не готово, если любое из трёх ложно. Не готово, если страницы не дочитаны.

## Закон

Правда на диске. Alfa — очередь ядра.
Ключи: `branchId`, `groupId`, `customerId`, `lessonId`. Не имя, не хэштег, не слот `date|from`.
Один календарь ученика на `customerId`. Одна group-card на `branchId+groupId`.
Одна перепись, одна очередь пакетов. Второго мозга id нет.
`keepAlfaProbe` не отменять. `lessonsSetGap` ученика (пустой seen → extra не считает) не менять.
Ромашка и деплой — только по просьбе.
Чужие файлы B–E не трогать. Текст «лишние N» на карточке — вкладка D; ядро отдаёт числа.

## API (сначала дока, потом код)

`POST /v2api/{branchId}/lesson/index`
Тело JSON, не query.

| Кто | Тело |
|---|---|
| Перепись / качка ученика | `customer_id`, `status` 1\|2\|3, `date_from`, `date_to`, `page`, `pageSize` |
| Добор дырки ученика | `id` (=lessonId), `status` 1\|2\|3, `page`, `pageSize`. Без `lesson_id`. Без `?id=` |
| Журнал группы | `group_id`, `status` 1\|2\|3, `date_from`, `date_to`, `page`, `pageSize` |

Без `status` Alfa отдаёт только 3. Цикл 1/2/3 обязателен.
Фильтры — И. Урок живёт в филиале URL. Даты **YYYY-MM-DD**.
Страницы: `received += items.length`; конец `total>0 ? received>=total : items.length < pageSize`.
Полная страница на потолке `pageCap` → обрыв, **не** готово, prune нет.

`pageSize` переписи ученика: **500** (потолок доки). Было 100. `pageCap` **12** не поднимать.
Качка страниц ученика и журнал группы: `pageSize` 100 как сейчас, не раздувать запросы.

## Счётчики — три числа, не одно

Считать всегда от **уникальных lessonId>0**.

| Имя | Что |
|---|---|
| `censusN` | `\|уникальные id ответа Alfa окна\|` (после фильтра своей сущности) |
| `diskUniq` | `countAlfaLessonUniq` — уникальные id на диске окна (или всего календаря, если окно пусто = вся история) |
| `diskRows` | `countAlfaLessonRows` — строк с `lessonId>0` |

`alfaKeep` ученика — штамп `lessonsAlfa` после `keepAlfaProbe`. Это не `censusN`, если keep завышен.
Жёлтый (short): `diskUniq < max(censusN, alfaKeep)` при живой/сохранённой пробе.
Лишние (extra): id на диске, которых нет в census, кроме protect.

Готово ученика (журнал шага 2):

```
pagesComplete
и hole.length === 0
и extra.length === 0
и diskUniq === censusN        // счёт id
и diskRows === diskUniq       // нет двух строк на один id
и !short по keepAlfaProbe     // keep не выше диска, если keep живой
```

`lessonsFull` только от этого. Длина `pack.total` **не** закрывает.
`n === total` порции **не** закрывает группу.

Готово группы в текущем окне:

```
страницы status 1,2,3 дочитаны
и hole.length === 0
и diskUniq === censusN
и diskRows === diskUniq
и синяя: extra/gone.length === 0 после prune
```

Красная группа: extra/gone **не** блокирует порцию (снимет синяя). hole и обрыв — блокируют (`weak`).

## Checksum — ярлык, не мозг

```
idsChecksum(ids) = стабильный hash отсортированных уникальных lessonId>0
```

Одна функция на ученика и группу. Не `journalFingerprint` (там ученики, суммы, тема).

Сверять:

```
sumAlfa  = idsChecksum(census)
sumDisk  = idsChecksum(have)
```

| sumAlfa === sumDisk | censusN === diskUniq | Что делать |
|---|---|---|
| да | да | множества те же, prune не нужен, посадка дырок не нужна |
| да | нет | **не готово** — коллизия или баг счёта, идти в hole/extra по id, не закрывать |
| нет | * | hole/extra по id, как сейчас |

Checksum в лог и на диск рядом с журналом группы: `journalIdsChecksum`, `journalCensusN`, `journalRecheckAt`.
Ученик: не новый файл — `lessonsHoleN` / `lessonsExtraN` / `lessonsSeenIds` уже есть. Checksum ученика можно не хранить, считать на лету из seen и have.
Второй карты id нет.

## Столбцы шага 2 (очередь не ломать)

| Цифры | Столбец | Кто чинит |
|---|---|---|
| diskUniq < Alfa (дырка, holeN>0 или short) | слева | Добрать / медленный |
| сошлось по правилу «готово» | справа, журнал закрыт | ничего |
| diskUniq > Alfa или extraN>0 при hole=0 | справа, **не** lessonsFull | синяя |

`peopleJobFinished`: extra/`dups` → вправо. **Не** тащить extra влево.
Галка `journalHoleApprovedAt` — только дырка, которую нельзя добрать. Extra галкой не закрывать.
`lessonsFull` при extra — нет (уже так, не откатывать).

Ядро в снимке ученика уже отдаёт `dups`, `short`, `lessonsHoleN`, `lessonsExtraN`.
Текст карточки «лишние N», не зелёный «ок» — **чат D**. В этом ТЗ экран не править.

## «Добрать» ≠ медленный

**Добрать** (жёлтая, один cid): только missing.

1. hole = seen − have (id).
2. `inboundMissingCustomerLessons` по этим id, status 1/2/3, филиалы 1–4, тело `{ id, status, page, pageSize }`.
3. Пока hole не пустой и Alfa отдаёт строки — крутить в этом клике, лимит 50 id за заход (36 Коваленко проходят).
4. Качку страниц `customer_id` из «Добрать» **убрать** (`take: 8` / `maxPages` 3 из этой кнопки).
5. Если hole остался и seated=0 — лог `dropped`, карточка жёлтая. Не «пачка 8». Дальше — медленный.

**Медленный автодобор** — не трогать: месяцы до 2015, курсор, 10 мин, 8 повторов сети.

Красная очередь слева: один человек → пауза 5 с → следующий. Как сейчас.

## Перепись ученика — запас без километра запросов

`censusCustomerLessonIds` / `probeCustomerLessons`:

* `pageSize: 500`
* `pageCap: 12` (потолок 6000 id на статус×филиал)
* полная 12-я страница → `ok: false`, keep не затирать вниз, cid не закрывать
* филиалы 1–4 не резать

Качка `inboundCustomerLessons` pageSize 100 — не менять в этом ТЗ.

## Окно синей: ±N, оба шага одинаково

Кнопки те же: месяц / 3 / 6. Числа те же: `32 | 92 | 182`.

**Было (03e / шаг 2):** `date_from = сегодня−N`, `date_to = сегодня+90` (у групп) или «с from до сейчас» (у ученика).

**Надо:**

```
date_from = сегодня − N
date_to   = сегодня + N
N ∈ {32, 92, 182}
```

Не квартал. Не 2015. Не `ruShift(90)` вместо +N.
Запланированные (status 1) впереди входят в окно «месяц», если дата урока ≤ сегодня+32.

Красная группа — по-прежнему квартал порции, без ±.
Красная ученика — с `dateFrom` джоба / 2015, без ±.

Синяя ученика и синяя группы читают **одно и то же** `clampRecheckDays`. Не два смысла у трёх кнопок.

## Шаг 2 синяя (уточнение)

Как 03c + 03f:

1. Перепись окна ±N, status 1/2/3, pageSize 500, cap 12.
2. Готово переписи только `pagesComplete`.
3. hole окна → missing по id.
4. gone окна → prune, кроме hold, `lessonId<0`, id с group-card её групп (`studentProtectLessonIds`).
5. `lessonsAlfa` окном вниз не писать (`keepAlfaProbe` / `windowAlfaKeep` как есть).
6. `lessonsFull` только если правило «готово» выше истинно.
7. Галка: missing и prune дырки нет; extra синяя всё равно может снять, галку не ставить и не снимать.

## Шаг 3 (уточнение к 03e)

Код 03e на диске локально (`18b270d`), на VPS может не быть — выкладка отдельно.

Добить в том же `inboundJournalGroup` / `pullOneGroup`:

1. **Окно синей ±N**, не −N…+90.
2. **Не стирать** строки без номера: `lessonId===0` и `lessonId<0` prune не трогает. Только `lessonId>0` вне census в окне, не hold.
3. Ключ слота по-прежнему `id:{lessonId}` для id>0. Строки без id не ключ переписи.
4. После дочитанных страниц посчитать `censusN`, `diskUniq`, `diskRows`, `sumAlfa`, `sumDisk`.
5. Штамп группы (journalFill, не новый файл):
   * `recheckAt`, `recheckDays`
   * `journalCensusN`, `journalDiskUniq`, `journalIdsChecksum`
   * **не** писать кварталам `rechecked` из окна месяца
6. Очередь `groups-recheck`: как сделано — без `nextGroupPart`. Не закрывать синюю тем, что квартал «перепроверен».
7. CGI-чанк: hole → `weak`, не «готово». Extra CGI не prune.
8. fanOut только новые id. `lessonsAlfa` ученика — только `noteAlfaLessonsLanded` как есть.
9. `lessonsSetGap` ученика не менять. Gone группы — `groupWindowGone`.

Бейдж D «есть неперепроверенные» после синей окна врёт, пока D читает кварталы. Ядро: штамп окна. Текст D — чат D.

## Лог (без ФИО как ключ)

Ученик: `cid`, `branchId`, `censusN`, `diskUniq`, `diskRows`, `holeN`, `extraN`, `keep`, `dropped` (id), `pagesComplete`.
Группа: `groupId`, `branchId`, `censusN`, `diskUniq`, `diskRows`, `holeN`, `goneN`, `checksum`, `pagesComplete`, `window`.
Добрать: `seated`, `dropped`, без «пачка 8» если качки страниц не было.

## Файлы ядра

* `src/data/crm-inbound-core.ts` — `idsChecksum`, окно ±N (from/to), не ломать `lessonsSetGap`.
* `src/data/crm-journal-inbound.ts` — pageSize 500 у census; Добрать без fill-страниц; группа ±N; не prune id 0; счёт + checksum.
* `src/data/crm-journal-pull.ts` — `pullOneStudent` Добрать = missing; синяя ученика `date_to = +N`; штамп группы без квартала rechecked.
* `src/data/crm-journal-job.ts` — очередь extra вправо не трогать.
* Тесты: `crm-inbound-core.test.ts`, `crm-journal-inbound.test.ts`, `crm-journal-pull.test.ts`.

Не трогать: `admin-crm-settings.tsx`, тексты главной, hero, SEO, `schedule-map`, вторую очередь, `syncAllFromCrm`.

## Тесты (обязательные)

1. Два набора по 12 разных id → не готово, хотя длины равны.
2. Наборы равны, `diskRows = diskUniq+1` (дубль строки) → не готово.
3. Наборы равны, счёт равен, checksum равен → готово, prune 0.
4. Checksum равен, счёт разный → не готово.
5. Перепись pageSize в запросе 500; 12-я полная страница → `ok: false`.
6. Добрать: нет вызова fill `customer_id` в том же заходе, если hole непустой; hole 36 id → missing; fill не обязателен.
7. Синяя ±32: урок сегодня+20 в census; урок сегодня−40 вне окна, на диске жив.
8. Группа: `lessonId===0` в окне после синей на месте.
9. Extra ученика: `peopleJobFinished` true, `lessonsFull` false.
10. Окно группы не пишет `rechecked` кварталу `2026q3`.
11. `keepAlfaProbe`: живая перепись 250 при keep 286 не пишет 250.
12. Даты в теле YYYY-MM-DD.

## Не делать

* Extra влево.
* Закрытие по checksum без счёта и без id.
* Закрытие по `pack.total` / `n===total`.
* `pageCap` 36 / 80 у ученика.
* «Добрать» = 10 минут.
* Квартал как синяя.
* `date_to` всегда +90 при кнопке «месяц».
* Вторая карта id, второй файл кассы/журнала.
* s20 с экрана.
* Править D молча.
* Ромашка, деплой без просьбы.

## Приёмка

Диск, не имя.

* Коваленко 5115: один «Добрать» либо +K по hole, либо лог dropped id, без «пачка 8» качки.
* Перепись не закрывает cid на потолке 12×500.
* Карточка extra: справа, `lessonsFull=false`, в снимке extraN>0. Текст «лишние» — после D.
* Группа синяя ± месяц: новые впереди в окне садятся; старше −32 на карточке не режутся; checksum и censusN на диске; квартал rechecked пустой.
* Два одинаковых счёта, разные id — слабо, слева или weak.

Простыми словами: закрываем ребёнка и группу, когда **те же номера уроков** и **столько же штук**, без двух строк на один номер. Картинка «12=12» без номеров — не готово. Справа смотрим месяц назад и месяц вперёд. Лишние справа, дырка слева. «Добрать» берёт эти номера, не листал все страницы.
