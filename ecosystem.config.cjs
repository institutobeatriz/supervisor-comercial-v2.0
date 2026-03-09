module.exports = {
  apps: [
    {
      name: 'supervisor-api',
      script: 'npm',
      args: 'run dev:api',
      cwd: 'C:/Users/user/.openclaw/workspace/supervisor-comercial',
      env: {
        NODE_ENV: 'development'
      },
      watch: false,
      autorestart: true,
      max_restarts: 10,
      restart_delay: 3000
    },
    {
      name: 'supervisor-worker',
      script: 'npm',
      args: 'run dev:worker',
      cwd: 'C:/Users/user/.openclaw/workspace/supervisor-comercial',
      env: {
        NODE_ENV: 'development'
      },
      watch: false,
      autorestart: true,
      max_restarts: 10,
      restart_delay: 3000
    }
  ]
};
