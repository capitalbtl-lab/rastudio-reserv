# Закон rastudio.org и вкладки Grok

Вставляйте блок «Закон» первым сообщением в каждую новую вкладку.

## Закон (не менять во вкладках B–E)

1. Источник правды — диск. Alfa только очередь. Не ходить в API «чтобы быстрее».
2. Ключ — ID, не имя и не хэштег: `branchId+groupId`, `customerId`, `tariffId`, `subjectId`, `courseId`, `lessonId`.
3. Ольга и кабинет читают одни поля. Новое поле — сначала диск, потом экраны.
4. Не плодить второй мозг, вторую карту ID, вторую воронку.
5. Чужие файлы из таблицы вкладки не трогать. Нужно общее — написать человеку.
6. Всегда после текста пиши простыми словами.

Ядро (только вкладка A): см. `src/data/kernel.ts` (`KERNEL_FILES`).
Не расширять список и не переименовывать ключи без этой вкладки.
`src/data/ids.ts`, `crm-disk-rules.ts`, `crm-local-id.ts`, очередь Alfa, `dossiers*.ts`, карты course/tariff, схема `Brain` в `agent-config.ts`.
Ночной inbound групп: `src/data/crm-night-groups.ts`, 04:00 Europe/Moscow, diff по `branchId+groupId`.
Касса-процесс: вкладка F. Один `crm-pays.json`. Очередь `pay.create` / `pay.delete`. Автоопрос **10/час (~6 мин)**: `pay/index` филиалы **1–4**, дата/id ≥ штампа, `pageSize` 50. Не обход всех `customerId`. Карточка «Обновить» одного клиента — **не** в лимите. Авто + кнопка D вместе ≤ 10/час.

---

## Вкладка A — Ядро (этот чат)

Бандл сайт ≠ кабинет, диск-схема, ключи, очередь-ядро, **деплой**.

Нельзя: тексты главной, сценарии Ольги, визуальный редактор, процесс кассы/poll/дирижёр (это F).

---

## Вкладка B — Сайт

```
Ты работаешь в rastudio.org. Закон из GROK-TABS.md обязателен.
Вкладка B — публичный сайт.
Можно: src/routes/index.tsx, $.tsx, schedule.tsx, site-header/footer/shell,
page-article, schedule-finder, trial-form, hero-collage, cms-blocks (вид),
SEO, видео без автоплея, src/components/home-read.tsx.
Нельзя: admin-*, dossiers, agent-facts, home-editor, home-studio, очередь Alfa.
После текста — простыми словами.
Сейчас задача: …
```

---

## Вкладка C — Редактор

```
Ты работаешь в rastudio.org. Закон из GROK-TABS.md обязателен.
Вкладка C — визуальный редактор главной.
Можно: home-editor.tsx, home-studio.tsx, home-layout*, page-media*, site-media,
медиатека, перетаскивание блоков, home-blocks.tsx (слои/драг).
Нельзя: править index.tsx кроме динамического импорта; CRM; мозг агента.
Пишешь JSON вёрстки. Сайт его читает. После текста — простыми словами.
Сейчас задача: …
```

---

## Вкладка D — CRM

```
Ты работаешь в rastudio.org. Закон из GROK-TABS.md обязателен.
Вкладка D — кабинет CRM.
Можно: admin-schedule, admin-clients, карточки, лиды, тарифы, предметы, журнал.
Alfa только через очередь ядра. Не s20.online на экран.
Нельзя: agent-funnel, agent-chips, тексты сайта, home-editor,
процесс кассы/poll/дирижёр (F), деплой (A).
После текста — простыми словами.
Сейчас задача: …
```

---

## Вкладка E — Консультант

```
Ты работаешь в rastudio.org. Закон из GROK-TABS.md обязателен.
Вкладка E — ИИ-консультант.
Можно: agent-chat.ts/tsx, agent-facts, agent-funnel, agent-chips, agent-makeup,
agent-client-desk, agent-identify, каналы, обучение, гайды.
Нельзя: очередь Alfa, вёрстку главной, цены групп в обход инструментов.
Пишешь в CRM только через completeClientAction / tools.
После текста — простыми словами.
Сейчас задача: …
```

---

## Вкладка F — Модуль синхронизации

Диск — правда. Alfa — очередь. Ключи: `customerId`, `branchId`, `id` платежа, `cttId`, `tariffId`. Не имя. Не s20 с экрана.
Опереться на Ромашку-9 (типы занятий, календарь с диска + inbound) и кассу Ромашки-10. Не откатывать 12 (педагоги), 13 (история), 14 (остаток шапки).
**Деплой — вкладка A.** F не запускает сборку и не выкладывает.

Сначала разбор. Код — только после «делай».

### Касса (закон, не todo)

1. Один файл `crm-pays.json`. Второй журнал кассы не заводить. Склейка `mergePayInbound` по `id` + `customerId`. Поля строки: `cttId`, `tariffId`, `payItemId`, `payAccountId`, `locationId`, `managerId`, `payMethod`, `groupId`, `deleted`. Типы: `income` / `product` / `refund` / `correct`. Alfa: 1 / 9 (старый 2) / 5 (старый 3) / 6. Invoice нет (отдельная постановка, если появится v2api).
2. Исходящее: диск сразу, Alfa догоняет очередью. После записи платежа — сразу `tickExportQueue` этого `pay.create` (`packAlfaPayCreate` + `ctt_id`). Не копить «потом сбросим пачкой».
3. Удаление: в очереди есть `pay.delete`. После ok — строка `deleted` или снять с журнала. Пока тика нет — в Alfa удаление не уходит. После `deletePay` на диске — сразу tick `pay.delete`.
4. Автоопрос **10 раз в час (~6 мин)**: `pay/index` филиалы **1–4**, дата/id ≥ штампа, `pageSize` 50. Не обход всех `customerId`. Не «каждые 15 мин за 3 дня всех клиентов». `mergePayInbound`: pending create/delete и `deleted` не затирать. Inbound сохраняет `ctt_id`. Авто + кнопка D (дочитать кассу) вместе ≤ 10/час. Карточка «Обновить» одного клиента — как сейчас, **в лимит не входит**.
5. Poll пишет только poll-fill / штамп ветки. Не ставит `complete[]` истории и не `paysRechecked`. Кнопка D не ходит в полный fill карточки. Дирижёр `payPoll` **SKIP**: cron `rastudio-pay-poll` + `tryLock("payPoll")`.

Не делать: poll каждую минуту, ночной обход учеников ради кассы, invoice, `enqueueExport` из истории / окна / коллег / дайджеста.

Критерий кассы: лог 4 филиала / сколько новых / без 429. Платёж из карточки за секунды в кассе Alfa. Из ЛК Alfa на диск не позже ~6 мин. Удаление с диска догоняет Alfa.

### Код сейчас (чтобы не чинить дважды)

- `PayRow` поля из п.1 уже в `crm-pay-core.ts`. Второй файл кассы нет.
- `appendPay` пишет диск. Tick create — `pushPayToAlfa` / `flushLocalPaysToAlfa`, не сам `appendPay`.
- `deletePay` ставит `pay.delete` в очередь, **тика сразу нет**.
- Автоопрос в коде: **4/час**, окно **3 дня**, cron-комментарий «15 мин». Закон — 10/час, штамп, не обход.
- Константы `PAY_POLL_*` и `PayRow` — `crm-pay-core.ts` = **ядро A**. F пишет процесс (`crm-pay.ts`, `scripts/crm-pay-poll.mjs`, очередь tick delete). Смену 4→10 и текст disk-rule money — в том же «делай», не отдельно.

### Фон и История (границы)

Процессы на диске / воркере, не в браузере. История-мастер: один объект + пауза 5 с, не пакет. Архив — вторая таблетка того же мастера, не отдельный раздел. Шаги: 1 группы и состав (`cgi`) → 2 календарь ученика → 3 занятия группы → 4 деньги → 5 сверка остатка. Из Истории **не писать** Alfa. «Ходят» = есть в группах, которые есть в админке **и** в Alfa. Не `is_study=1`. Формы записи на сайте не трогать.

ТЗ центра: `docs/tz-sync-center/` (политика, дирижёр, штампы, окно, коллеги, отработки, дайджест, UI истории). Новые потоки — отдельная постановка, не «заодно». Рамашку 12 не трогать (`crm-group-teachers-core`, `crm-group-export-core`, inspect слота, `pickTeacherIds` нет).

### Первый прогон (вставить целиком)

```
Ты работаешь в rastudio.org. Закон из GROK-TABS.md обязателен.
Вкладка F — модуль синхронизации: диск ↔ Alfa.
Можно: crm-pay.ts, crm-pay-alfa.ts, scripts/crm-pay-poll.mjs,
crm-sync-policy*, crm-journal-job*, crm-journal-pull.ts, crm-history-load.ts,
crm-roster.ts, crm-night-groups.ts (ночь каталога), docs/tz-sync-center/,
scripts/crm-history-worker.mjs, scripts/crm-night-groups.mjs.
Очередь: только pay.create / pay.delete и tick после записи. Ядро очереди
(crm-export-queue-core, KERNEL_FILES) не расширять без A.
Нельзя: деплой; тексты сайта; home-editor; сценарии Ольги; формы записи на сайте;
s20 на экран; ходить в Alfa мимо очереди; poll всех customerId; invoice;
пакеты в Истории; писать Alfa из Истории; Рамашка 12; второй crm-pays.
Сначала разбор. Код — только после «делай». После текста — простыми словами.
Сейчас задача: …
```

---

Параллелить безопасно: B+D, C+D, E+B, F+B, F+C.
Не параллелить: E+голос, C+B на home-blocks, D+A на очереди, E+D на agent-client-desk.ts,
F+A на очереди / `crm-pay-core` / `KERNEL_FILES`, F+D на Истории UI и экране кассы, F+E на `book_lesson`.
