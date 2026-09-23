/**
 * pm2 설정 (PRD 11장). 서버에서: pm2 start ecosystem.config.cjs && pm2 save
 *  - 포트 3300 (같은 서버의 3000/3100/3210 은 다른 앱이 사용)
 *  - .env 는 server 디렉터리에서 dotenv 로 읽는다 (cwd 주의)
 */
module.exports = {
  apps: [
    {
      name: 'ras-point',
      cwd: __dirname,
      script: 'server/dist/index.js',
      instances: 1,
      exec_mode: 'fork',
      max_memory_restart: '300M',
      env: {
        NODE_ENV: 'production',
        PORT: 3300,
        TZ: 'Asia/Seoul',
      },
      out_file: '/var/log/ras-point/out.log',
      error_file: '/var/log/ras-point/error.log',
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      time: true,
    },
  ],
};
