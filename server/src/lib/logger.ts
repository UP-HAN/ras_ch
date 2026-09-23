import pino from 'pino';
import { env, isProd } from '../config/env.js';

/**
 * 로그에 학생 이름·이미지 경로·비밀번호를 남기지 않는다 (절대 규칙 8).
 * 아래 경로에 해당하는 필드는 자동으로 [지움] 처리된다.
 */
const REDACT_PATHS = [
  'name',
  'display_name',
  'displayName',
  'password',
  'password_hash',
  'passwordHash',
  'path',
  'image_path',
  'req.headers.cookie',
  'req.headers.authorization',
  '*.name',
  '*.display_name',
  '*.password',
  '*.path',
];

export const logger = pino({
  level: env.NODE_ENV === 'test' ? 'silent' : isProd ? 'info' : 'debug',
  redact: { paths: REDACT_PATHS, censor: '[지움]' },
  ...(isProd
    ? {}
    : {
        transport: {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'SYS:HH:MM:ss', ignore: 'pid,hostname' },
        },
      }),
});

export type Logger = typeof logger;
