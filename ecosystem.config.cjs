const fs = require("fs");
const path = require("path");

function loadEnvFile() {
  const file = path.join(__dirname, ".env");
  const env = {};
  try {
    for (const line of fs.readFileSync(file, "utf8").split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const i = trimmed.indexOf("=");
      if (i < 1) continue;
      env[trimmed.slice(0, i)] = trimmed.slice(i + 1).trim();
    }
  } catch {
    /* no .env */
  }
  return env;
}

module.exports = {
  apps: [
    {
      name: "rastudio",
      script: ".output/server/index.mjs",
      instances: 1,
      exec_mode: "fork",
      kill_timeout: 8000,
      listen_timeout: 12000,
      max_memory_restart: "700M",
      exp_backoff_restart_delay: 2000,
      node_args: "--max-old-space-size=640",
      env: {
        NODE_ENV: "production",
        HOST: "0.0.0.0",
        PORT: 3000,
        ...loadEnvFile(),
      },
    },
    {
      name: "rastudio-calls",
      script: "scripts/transcribe-novofon.py",
      interpreter: "python3",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_restarts: 20,
      restart_delay: 8000,
      env: {
        PYTHONUNBUFFERED: "1",
      },
    },
    {
      name: "rastudio-deploy",
      script: "scripts/beget-watch.mjs",
      interpreter: "node",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_restarts: 8,
      min_uptime: 30000,
      restart_delay: 60000,
      env: {
        NODE_ENV: "production",
      },
    },
    {
      name: "rastudio-night-groups",
      script: "scripts/crm-night-groups.mjs",
      interpreter: "node",
      interpreter_args: "--experimental-strip-types",
      instances: 1,
      exec_mode: "fork",
      autorestart: false,
      cron_restart: "0 4 * * *",
      watch: false,
      env: {
        TZ: "Europe/Moscow",
        NODE_ENV: "production",
        ...loadEnvFile(),
      },
    },
    {
      name: "rastudio-pay-poll",
      script: "scripts/crm-pay-poll.mjs",
      interpreter: "node",
      interpreter_args: "--experimental-strip-types",
      instances: 1,
      exec_mode: "fork",
      autorestart: false,
      cron_restart: "*/15 * * * *",
      watch: false,
      env: {
        TZ: "Europe/Moscow",
        NODE_ENV: "production",
        ...loadEnvFile(),
      },
    },
  ],
};