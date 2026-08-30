# Развёртывание rastudio.org

Сайт — TanStack Start (React + Vite + Nitro). Репозиторий: [capitalbtl-lab/rastudio-reserv](https://github.com/capitalbtl-lab/rastudio-reserv).

Пока DNS `rastudio.org` смотрит на Wix, эта копия — превью. Canonical уже ведут на `https://www.rastudio.org/...`.

## Beget (Cloud VPS + Node.js)

Обычного виртуального хостинга мало — нужен **Cloud VPS с образом Node.js** (там уже PM2 и Nginx).

### Один раз в панели

1. [beget.com](https://beget.com) → **Регистрация** (почта, российский номер).
2. [Панель](https://cp.beget.com) → **Облако** / Cloud → **Каталог** → **Node.js** → создать VPS (хватит 1 CPU / 1 ГБ).
3. Дождитесь письма, что сервер готов. Запишите IP и пароль root.
4. В панели привяжите технический домен Beget или поддомен (например `new.rastudio.org`) к IP сервера. `rastudio.org` пока не трогайте.

### На сервере (SSH)

```bash
ssh root@IP_СЕРВЕРА
apt-get update && apt-get install -y git
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt-get install -y nodejs
cd /var/www
git clone https://github.com/capitalbtl-lab/rastudio-reserv.git rastudio
cd rastudio
npm ci
npm run build:beget
npm install -g pm2
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup
```

Сайт слушает порт **3000**. В образе Node.js из каталога Beget Nginx уже проксирует 80 → 3000. Если заходите по IP и видите заглушку Nginx — в конфиге сайта `proxy_pass http://127.0.0.1:3000`.

Обновление после пуша в GitHub:

```bash
cd /var/www/rastudio
git pull
npm ci
npm run build:beget
pm2 restart rastudio
```

## GitHub Actions

На каждый пуш в `main` и на pull request:

1. **CI** — `npm ci`, проверка типов, production-сборка.
2. **Deploy (Vercel)** — пропускается, пока нет секретов Vercel. Для Beget выкладка идёт на сервере командами выше.

## Мониторинг

После каждого CI/Deploy:

- при **падении** открывается GitHub Issue со ссылкой на логи;
- Grok шлёт уведомление, если CI или Deploy на `main` упали.

Секрет для ежедневной проверки живого сайта:

| Секрет | Зачем |
|---|---|
| `PRODUCTION_URL` | Адрес на Beget, когда откроется, например `https://new.rastudio.org/` |

## Как заменить Wix

1. Убедитесь, что копия на Beget отвечает 200 на все 133 URL из sitemap.
2. A-запись `rastudio.org` на IP VPS.
3. Wix не удаляйте сразу.
4. URL страниц не меняйте.

## Форма записи

Пробное занятие и кабинет остаются на AlfaCRM:

- `https://studiyarazvivaysya.s20.online/`
- форма заявки с `lead_source_id=2`
