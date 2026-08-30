# Развёртывание rastudio.org

Сайт — TanStack Start (React + Vite + Nitro). Репозиторий: [capitalbtl-lab/rastudio-reserv](https://github.com/capitalbtl-lab/rastudio-reserv).

Пока DNS `rastudio.org` смотрит на Wix, эта копия — превью. Canonical уже ведут на `https://www.rastudio.org/...`.

## CI/CD

На каждый пуш в `main` и на pull request GitHub Actions:

1. **CI** — `npm ci`, проверка типов, production-сборка.
2. **Deploy** — выкладка на Vercel, если заданы секреты.

### Секреты репозитория

[Settings → Secrets and variables → Actions](https://github.com/capitalbtl-lab/rastudio-reserv/settings/secrets/actions) — три значения из Vercel:

| Секрет | Где взять |
|---|---|
| `VERCEL_TOKEN` | [vercel.com/account/tokens](https://vercel.com/account/tokens) |
| `VERCEL_ORG_ID` | Vercel → Project → Settings → General |
| `VERCEL_PROJECT_ID` | там же |

Пока секретов нет, деплой просто пропускается, проверка сборки всё равно идёт.

### Один раз на Vercel

1. Создайте проект и привяжите GitHub-репозиторий **или** оставьте деплой только через Actions (не включайте оба сразу — будет двойная выкладка).
2. Framework: Other, Build: `npm run build`, Node 22.
3. Скопируйте Org ID и Project ID в секреты выше.

## Мониторинг

После каждого CI/Deploy:

- при **падении** открывается GitHub Issue со ссылкой на логи (повторные сбои — комментарий в том же issue);
- после **успешной выкладки** на Vercel проверяется, что главная отвечает `200`;
- раз в сутки (09:15 МСК) — проверка `PRODUCTION_URL`, если секрет задан.

Grok тоже шлёт уведомление, если CI или Deploy на `main` завершились с ошибкой.

Дополнительный секрет:

| Секрет | Зачем |
|---|---|
| `PRODUCTION_URL` | Адрес живого сайта для ежедневной проверки, например `https://www.rastudio.org/` |

## Как заменить Wix

1. Убедитесь, что production на Vercel отвечает 200 на все 133 URL из sitemap.
2. A/CNAME `rastudio.org` на Vercel.
3. Wix не удаляйте сразу.
4. URL страниц не меняйте.

## Форма записи

Пробное занятие и кабинет остаются на AlfaCRM:

- `https://studiyarazvivaysya.s20.online/`
- форма заявки с `lead_source_id=2`
