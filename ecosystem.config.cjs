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
      },
    },
  ],
};
