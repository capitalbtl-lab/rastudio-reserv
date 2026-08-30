module.exports = {
  apps: [
    {
      name: "rastudio",
      script: ".output/server/index.mjs",
      instances: 1,
      exec_mode: "fork",
      env: {
        NODE_ENV: "production",
        HOST: "0.0.0.0",
        PORT: 3000,
      },
    },
  ],
};
