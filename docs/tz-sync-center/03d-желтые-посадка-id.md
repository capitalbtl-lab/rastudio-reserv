# 3d. Жёлтые «в Alfa больше»: посадка id

**REV:** 2026-09-13-yellow-seat-3  
**Ядро A.**  
**Код:** `src/data/crm-journal-inbound.ts`, курсор `lessonFill` в `crm-customer-sync.json`. Воркер `rastudio-history`.  
**Не делать в этом ТЗ:** занижать `lessonsAlfa` (3a), касса шаг 4, сверка `.m` шаг 5, `{customer.balance.c}` как число журнала, второй файл календаря, s20 с экрана, ромашка, деплой без просьбы, кнопка D до отдельного «делай».

Цель: номер занятия, который проба уже посчитала, появляется строкой на диске. Пока диск < keep — `short`, cid не закрывать.

Простыми словами: Alfa сказала «этот lessonId есть у cid» — либо строка на диске, либо лог, что по `customer_id+id` урока нет. Не «пачка 8 и готово».

---

## 0. Что уже есть (не переписывать)

Один календарь: `loadCustomerCalendar` / `replaceCustomerCalendar`.  
Один штамп: `lessonsDisk`, `lessonsAlfa`, `lessonsSeenIds`, `lessonFill`.  
Одна очередь: `pullOneStudent`.

| Ход | Функция | Запрос |
|---|---|---|
| Перепись | `censusCustomerLessonIds` | `customer_id` + status 1/2/3, pageSize 100, потолок 12 стр. |
| Качка | `inboundCustomerLessons` | то же, курсор `lessonFill`, пачка 8 |
| Дырки | `inboundMissingCustomerLessons` | `{id}`, `{lesson_id}`, `{id,lesson_id}` |

«Добрать» = missing до 50 + цикл 6× `take:8`. `packLight` без даты → null; вызовы уже ставят `2015-01-01`.

---

## 1. Закон ключей и типов

Ключ: `customerId` + `lessonId`.  
`customer_id` в index — все типы (группа `group_ids`, индивид/пробный `customer_ids`, летняя 15 и др.). Не фильтровать тип 2.  
`regular-lesson` не класть. Без `status` Alfa отдаёт только 3 — мы шлём 1,2,3.  
`pageSize` до 500, стоп `count < pageSize` или `received >= total`, ~5 запр/с.

`{customer.balance.c}` — остаток абонемента, не число строк журнала. `{customer.balance.m}` — шаг 5. `{customer.name}` / `{customer.legal}` — не это ТЗ.

---

## 2. Факт 13.09

Проба посчитала id. Missing ищет голый `{id}` → `dropped`. Keep не снижаем.

Хвост 1–26: 17, 55, 723, 5115, 3284, 3908, 3111, 3030, 5431, 699, 5441.  
Яма: 5601 150/336, 2124 244/498, 3283 219/408.

---

## 3. Правка 1 — missing (первый коммит A)

После трёх тел, если не нашли:

```
{ page:0, pageSize:5, customer_id: cid, id: lessonId }
```

`uniqueBranches`. `items[].id === lessonId` обязательно.  
Дата: `ymd` или `2015-01-01`. `customer_ids` ∪ cid. `packLight` null при `lessonId>0` → фолбэк. Merge `union`, pending не затирать. `lessonsFull`/`lessonsAlfa` не писать. Не нашли — `dropped`.

«Добрать» не раздувать.

---

## 4. Правка 2 — «Дочитать календарь»

Не вшивать в «Добрать». Ядро: `inboundCustomerLessons` **без** `resetSeen`, пачка 8, курсор жив, в конец очереди (как касса `d0d6781`). Стоп: короткая страница / `total`. Aborted ≠ done.

Кнопка — экран D, отдельное «делай». Не третья копия «Добрать» и не «Загрузить всю историю» (та сейчас с 2015 **и тем же resetSeen**).

«С нуля» = `resetStudentLessonDisk`, не каждый Добрать.

---

## 5–8. Не менять / тесты / приёмка / порядок

Не трогать: 3a, census потолок, шаг 4, главную, ФИО.  
Тесты: тело `customer_id`+`id`; без pupils строка садится; dropped не врёт диск; keep не падает.  
Приёмка: Силаева 1; Лушникова 5; ямы одним Добрать не закрыть.  
Порядок: **делай** → правка 1 → деплой по A → лог seated/dropped → отдельно правка 2 и D.

---

## 9. Последствия на 10 уровней (перепроверка кода)

Читал: missing ← Добрать/красная/синяя; inbound ← pull, `admin-schedule` take 6, audit take 8; `lessonFill`/`resetSeen`; `skipHoleInbound`; census prune; шаг 3 group-card; шаг 5 writeoff; lock кассы.

| # | Цепочка | Следствие | Вердикт |
|---|---|---|---|
| 1 | 50 id × филиалы | 4-е тело **только после** трёх промахов (`break outer`). Не +800 запросов | не параллелить |
| 2 | `find(id===lid)` | Alfa игнор `id` + чужие 5 строк → не сажаем | сверку id не снимать |
| 3 | дата 2015, pupils пустые | amount 0, шаг 5 не раздувается; дата на экране лжёт | amount с потолка не ставить |
| 4 | merge `union` | тот же id с группы (шаг 3) не двоится; pending hold | ок |
| 5 | keepAlfaProbe | диск ↑, keep нет; 498 не лечится | 3a |
| 6 | синяя prune | фантом, которого census больше нет — снимет (кроме group/hold) | prune не запрещать |
| 7 | skipHoleInbound | без force skip; Добрать `force:true` | 3b не менять |
| 8 | шаг 5 writeoff | больше живых уроков → remainder изменится честно | remainderClose не трогать |
| 9 | admin-schedule take 6 | без missing, правка 1 не кормит | D-маршрут не трогать |
| 10 | касса + night + lock | busy-wait 20 с уже есть | lock не снимать |

**Дыра, которую 3d обязан учесть в правке 2:** каждый «Добрать» делает `resetSeen: i===0` — обнуляет `lessonFill` и `lessonsSeenIds`. Курсор с нуля. Яма 186 никогда не дочитывается этой кнопкой. «Дочитать» = inbound **без** resetSeen. Молча выключать reset на «Добрать» нельзя: «С нуля» живёт отдельно.

Не дыры: census 12×100, regular-lesson, `.c`, ФИО 3283.
