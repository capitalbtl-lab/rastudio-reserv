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
      instances: 2,
      exec_mode: "cluster",
      kill_timeout: 8000,
      listen_timeout: 12000,
      env: {
        NODE_ENV: "production",
        HOST: "0.0.0.0",
        PORT: 3000,
        ...loadEnvFile(),
      },
    },
  ],
};