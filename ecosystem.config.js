module.exports = {
  apps: [
    {
      name: 'mcs-backend',
      cwd: __dirname + '/mcs_backend',
      script: 'dist/server.js',
      env: {
        NODE_ENV: 'production',
        PORT: 3100,
      },
    },
    {
      name: 'mcs-web',
      cwd: __dirname + '/mcs_web',
      script: 'node_modules/.bin/next',
      args: 'start -p 3101',
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
