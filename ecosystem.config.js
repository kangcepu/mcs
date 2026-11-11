module.exports = {
  apps: [
    {
      name: 'mcs-backend',
      cwd: __dirname + '/mcs_backend',
      script: 'dist/server.js',
      env: {
        NODE_ENV: 'production',
        PORT: 3100,
        MCS_WEB_BASE_URL: 'http://192.168.11.2:3101',
      },
    },
    {
      name: 'mcs-web',
      cwd: __dirname + '/mcs_web',
      script: 'node_modules/next/dist/bin/next',
      args: 'start -p 3101',
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
