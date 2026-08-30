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

CI/CD: GitHub Actions в [capitalbtl-lab/rastudio-reserv](https://github.com/capitalbtl-lab/rastudio-reserv) проверяет сборку на каждый пуш. Выкладка на Vercel — когда заданы секреты `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`.

Подробности: [DEPLOY.md](./DEPLOY.md).

## Форма записи

Пробное занятие и кабинет остаются на AlfaCRM:

- https://studiyarazvivaysya.s20.online/
