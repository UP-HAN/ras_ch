/**
 * 시연(가상 데이터) 인스턴스 pm2 설정 — 운영(ras-point, 3300)과 별도 디렉터리·DB·포트로 돈다.
 *   서버: cd /var/app/ras-demo && pm2 start deploy/ecosystem.demo.config.cjs && pm2 save
 *   .env: PORT=3301, DB_NAME=ras_demo, UPLOAD_DIR=/var/app/ras-demo/server/uploads, CLIENT_ORIGIN=https://ras1.ches.es.kr
 */
module.exports = {
  apps: [
    {
      name: 'ras-demo',
      cwd: `${__dirname}/..`,
      script: 'server/dist/index.js',
      instances: 1,
      exec_mode: 'fork',
      max_memory_restart: '250M',
      env: {
        NODE_ENV: 'production',
        PORT: 3301,
        TZ: 'Asia/Seoul',
      },
      out_file: '/var/log/ras-demo/out.log',
      error_file: '/var/log/ras-demo/error.log',
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      time: true,
    },
  ],
};
