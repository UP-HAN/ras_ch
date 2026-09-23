import express, { type Express } from 'express';
import session from 'express-session';
import helmet from 'helmet';
import path from 'node:path';
import { pinoHttp } from 'pino-http';
import { env, isProd } from './config/env.js';
import { pingDb } from './db/pool.js';
import { ok } from './lib/apiResponse.js';
import { logger } from './lib/logger.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { createSessionMiddleware } from './middleware/session.js';
import type { UserLoader } from './middleware/auth.js';
import { createApiRouter } from './routes/index.js';

export interface CreateAppOptions {
  /**
   * 테스트 전용(NODE_ENV=test 에서만 동작): 메모리 세션 + `x-test-user-id` 헤더로 로그인 상태를 흉내 내고,
   * 사용자 로딩은 주입한 loader 로 한다(DB 불필요).
   */
  testAuth?: { userLoader: UserLoader };
}

export function createApp(opts: CreateAppOptions = {}): Express {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1); // nginx 리버스 프록시 뒤에서 secure 쿠키 판단

  app.use(
    helmet({
      // 이미지·PWA는 같은 오리진에서만 제공. 세부 CSP는 배포(5-9) 때 nginx 와 함께 조정
      contentSecurityPolicy: isProd ? undefined : false,
      crossOriginResourcePolicy: { policy: 'same-origin' },
    }),
  );
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: false }));
  app.use(
    pinoHttp({
      logger,
      autoLogging: { ignore: (req) => req.url === '/healthz' },
      // 학생 이름·이미지 경로가 로그에 남지 않도록 요청 본문은 기록하지 않는다
      serializers: {
        req: (req: { method: string; url: string }) => ({ method: req.method, url: req.url }),
        res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
      },
    }),
  );

  if (opts.testAuth && env.NODE_ENV === 'test') {
    app.use(
      session({
        secret: 'test',
        resave: false,
        saveUninitialized: false,
        cookie: { sameSite: 'lax' },
      }),
    );
    app.use((req, _res, next) => {
      const raw = req.get('x-test-user-id');
      if (raw) req.session.userId = Number(raw);
      next();
    });
  } else {
    app.use(createSessionMiddleware());
  }

  // 헬스체크 (11장 모니터링). DB 연결까지 확인
  app.get('/healthz', async (_req, res) => {
    const db = await pingDb();
    res.status(db ? 200 : 503).json(ok({ status: db ? 'ok' : 'degraded', db: db ? 'ok' : 'down' }));
  });

  // 업로드된 리사이즈 이미지(원본은 저장하지 않음). 접근 제어는 S2에서 라우트로 감싼다
  app.use('/uploads', express.static(path.resolve(env.UPLOAD_DIR), { index: false, maxAge: '7d' }));

  app.use(
    '/api/v1',
    createApiRouter(opts.testAuth ? { userLoader: opts.testAuth.userLoader } : {}),
  );

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
