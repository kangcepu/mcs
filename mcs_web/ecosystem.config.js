/**
 * PM2 process config — MCS Web (Next.js 15). App dengar di 0.0.0.0:3005.
 *
 * Deploy:  npm ci && npm run build && pm2 start ecosystem.config.js && pm2 save
 * Update:  npm ci && npm run build && pm2 reload mcs-web
 *
 * PENTING sebelum deploy: daftarkan origin web di backend
 *   application/config/config.php -> $config['api_v2_allowed_origins']
 *   (mis. 'http://192.168.9.202:3005'), lalu restart PHP/Apache.
 */
module.exports = {
  apps: [
    {
      name: "mcs-web",
      cwd: __dirname,
      script: "node_modules/next/dist/bin/next",
      args: "start -p 3005",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      watch: false,
      max_memory_restart: "512M",
      kill_timeout: 5000,
      env: { NODE_ENV: "production", PORT: "3005", HOSTNAME: "0.0.0.0" },
    },
  ],
};
