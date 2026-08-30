# Студия «Развивайся» — rastudio.org

Современная копия сайта [www.rastudio.org](https://www.rastudio.org/) с теми же адресами страниц, title, description, canonical, заголовками, alt и именами файлов картинок.

Это **отдельный репозиторий** для выкладки на ваш хостинг. Пока DNS указывает на Wix, эта версия — превью. Когда будете готовы заменить Wix, направьте домен сюда **без смены URL**.

## Что сохранено для SEO

- 133 адреса из sitemap (`/art-studio`, `/team/...`, `/master-klassy/...` и остальные)
- Те же `<title>`, meta description, og:title, og:image, canonical
- Те же формулировки H1/H2 главной
- Картинки с `static.wixstatic.com` — исходные имена файлов и alt
- `public/sitemap.xml` и `public/robots.txt`

## Локальный запуск

```bash
npm install
npm run dev
```

Сборка:

```bash
npm run build
```

## Выкладка на хостинг

1. Подключите этот репозиторий к [Vercel](https://vercel.com), Timeweb Cloud, Beget Node или любому хосту с Node 22.
2. Build: `npm install && npm run build`
3. Старт production: команда, которую выдаёт Nitro после сборки (обычно `node .output/server/index.mjs`).
4. Когда будете менять DNS `rastudio.org`:
   - A/CNAME на новый хостинг
   - Wix не удаляйте сразу — сначала убедитесь, что все 133 URL отвечают 200
   - canonical уже ведут на `https://www.rastudio.org/...`

Подробнее: [DEPLOY.md](./DEPLOY.md).

## Форма записи

Пробное занятие и кабинет остаются на AlfaCRM:

- https://studiyarazvivaysya.s20.online/
