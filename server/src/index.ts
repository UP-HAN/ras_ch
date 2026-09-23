import { createApp } from './app.js';
import { env } from './config/env.js';
import { closePool } from './db/pool.js';
import { registerJobs } from './jobs/index.js';
import { registerAutoEscalate } from './jobs/autoEscalate.js';
import { logger } from './lib/logger.js';
import { LedgerPointService } from './services/points/LedgerPointService.js';
import { setPointService } from './services/points/PointService.js';

// PT-01: 모든 지급·회수는 원장 구현체를 거친다
setPointService(new LedgerPointService());
registerAutoEscalate();

const app = createApp();
const server = app.listen(env.PORT, () => {
  logger.info(
    { port: env.PORT, env: env.NODE_ENV, tz: process.env.TZ },
    '초롱 RAS 포인트 서버 시작',
  );
  registerJobs();
});

async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, '서버 종료 중');
  server.close(() => {
    void closePool().finally(() => process.exit(0));
  });
  setTimeout(() => process.exit(1), 5000).unref();
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
