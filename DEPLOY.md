# Развёртывание новой версии rastudio.org

Сайт собран как TanStack Start (React + Vite). Адреса страниц, title, description, canonical, alt и имена файлов картинок совпадают с текущим rastudio.org.

Пока DNS `rastudio.org` смотрит на Wix — эта копия только превью. Canonical уже ведут на `https://www.rastudio.org/...`.

## Что сохранено для SEO

- Те же 133 URL из sitemap: `/art-studio`, `/team/...`, `/master-klassy/...` и остальные.
- Те же `<title>`, meta description, canonical, og:title / og:image.
- Те же формулировки H1/H2 главной.
- Картинки с `static.wixstatic.com` — исходные имена файлов и alt.
- `public/sitemap.xml` и `public/robots.txt`.

## GitHub

Аккаунт [capitalbtl-lab](https://github.com/capitalbtl-lab) подключён, но у приложения Grok **нет права создавать репозитории**.

Чтобы я загрузил код в отдельный репозиторий `rastudio-org`, сделайте одно:

1. На [github.com/new](https://github.com/new) создайте **пустой** приватный репозиторий `rastudio-org` (без README, без .gitignore, без лицензии) и напишите сюда «репозиторий готов» — я запушу код.
2. Либо в Grok заново подключите GitHub и включите право **Administration** (создание репозиториев), затем напишите «пуш в rastudio-org».

Архив исходников для ручной загрузки: `rastudio-org.zip`.

## Как выложить на хостинг

1. Подключите репозиторий (или распакованный архив) к [Vercel](https://vercel.com), Timeweb Cloud, Beget Node или любому хосту с Node 22.
2. Build: `npm install && npm run build`
3. Старт production: команда Nitro после сборки (обычно `node .output/server/index.mjs`).
4. Когда будете готовы заменить Wix:
   - A/CNAME `rastudio.org` на новый хостинг;
   - Wix не удаляйте сразу — сначала убедитесь, что все 133 URL отвечают 200;
   - URL страниц не меняйте.

## Форма записи и кабинет

Пробное занятие и личный кабинет остаются на AlfaCRM:

- `https://studiyarazvivaysya.s20.online/`
- форма заявки с `lead_source_id=2`
