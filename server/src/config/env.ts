import { config as loadDotenv } from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

// 루트 .env 를 경로 고정으로 읽는다 (server/src/config → 리포 루트, dist/config → 리포 루트).
const here = path.dirname(fileURLToPath(import.meta.url));
loadDotenv({ path: path.resolve(here, '../../../.env'), quiet: true });

// 서버 시각은 항상 Asia/Seoul (절대 규칙 7)
process.env.TZ = 'Asia/Seoul';

/** 빈 문자열(`KEY=`)은 미설정으로 본다 */
const emptyToUndefined = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? undefined : v);

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DB_HOST: z.string().default('127.0.0.1'),
  DB_PORT: z.coerce.number().int().positive().default(3306),
  DB_USER: z.string().default('ras'),
  DB_PASSWORD: z.string().default(''),
  DB_NAME: z.string().default('ras_point'),
  DB_ROOT_PASSWORD: z.string().optional(),
  SESSION_SECRET: z.string().min(16, 'SESSION_SECRET는 16자 이상이어야 합니다'),
  UPLOAD_DIR: z.string().default('server/uploads'),
  CLIENT_ORIGIN: z.string().default('http://localhost:5173'),
  /** 운영 인스턴스에서 관리자에게만 보여 줄 두 번째 사이트 주소(화면에는 아무 표시도 없다) */
  DEMO_SITE_URL: z.string().optional(),
  /** 백업 지점 폴더(절대 경로). 없으면 백업·복원 기능이 꺼진다 (BKP-01, BKP-05) */
  BACKUP_DIR: z.preprocess(
    emptyToUndefined,
    z
      .string()
      .refine((p) => path.isAbsolute(p), 'BACKUP_DIR 는 절대 경로여야 합니다')
      .optional(),
  ),
  /** 자동·복원 직전 백업 보관 일수 (BKP-02) */
  BACKUP_KEEP_DAYS: z.coerce.number().int().min(1).max(365).default(14),
  /** mysqldump·mysql 실행 파일 폴더. PATH 에 있으면 비워 둔다 (윈도우 개발 PC 용) */
  MYSQL_BIN_DIR: z.preprocess(emptyToUndefined, z.string().optional()),
  /** pm2 실행 파일 경로. 비우면 node 옆 → PATH 순으로 찾는다 */
  PM2_BIN: z.preprocess(emptyToUndefined, z.string().optional()),
});

export type Env = z.infer<typeof schema>;

function parseEnv(): Env {
  const result = schema.safeParse(process.env);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(
      `.env 설정이 올바르지 않습니다.\n${issues}\n(.env.example을 복사해 .env를 만드세요)`,
    );
  }
  return result.data;
}

export const env: Env = parseEnv();
export const isProd = env.NODE_ENV === 'production';
