// pm2 ecosystem — runs worker + captcha-server together.
//   pm2 start ecosystem.config.cjs
//   pm2 logs
//   pm2 stop all
module.exports = {
  apps: [
    {
      name: 'veo-farm-captcha',
      cwd: __dirname,
      script: 'node_modules/.bin/tsx',
      args: 'src/captcha-server/server.ts',
      watch: false,
      autorestart: true,
      max_restarts: 20,
      env: {
        NODE_ENV: 'production',
        CAPTCHA_PORT: '3456',
        CAPTCHA_MODE: 'auto',
      },
    },
    {
      name: 'veo-farm-worker',
      cwd: __dirname,
      script: 'node_modules/.bin/tsx',
      args: 'src/index.ts',
      watch: false,
      autorestart: true,
      max_restarts: 20,
      env: {
        NODE_ENV: 'production',
        WORKER_POLL_INTERVAL_MS: '3000',
      },
    },
  ],
};
