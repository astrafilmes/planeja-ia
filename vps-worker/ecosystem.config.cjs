// PM2 config — use com:  pm2 start ecosystem.config.cjs
module.exports = {
  apps: [
    {
      name: "planeja-m2a-worker",
      script: "src/server.js",
      cwd: __dirname,
      instances: 1,
      exec_mode: "fork",
      watch: false,
      env: { NODE_ENV: "production" },
    },
  ],
};
