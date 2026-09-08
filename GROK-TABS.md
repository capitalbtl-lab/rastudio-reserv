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
Касса: `crm-pays.json`, очередь `pay.create`/`pay.delete`, автоопрос каждые 15 мин за 3 дня все типы (`scripts/crm-pay-poll.mjs`). Карточка «Обновить» одного клиента — не в лимите.

---

## Вкладка A — Ядро (этот чат)

Бандл сайт ≠ кабинет, диск, очередь, деплой.

Нельзя: тексты главной, сценарии Ольги, визуальный редактор.

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
Нельзя: agent-funnel, agent-chips, тексты сайта, home-editor.
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

Параллелить безопасно: B+D, C+D, E+B.
Не параллелить: E+голос, C+B на home-blocks, D+A на очереди, E+D на agent-client-desk.ts.
