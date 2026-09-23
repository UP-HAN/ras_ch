import { config as loadDotenv } from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

// 루트 .env 를 경로 고정으로 읽는다 (server/src/config → 리포 루트, dist/config → 리포 루트).
const here = path.dirname(fileURLToPath(import.meta.url));
loadDotenv({ path: path.resolve(here, '../../../.env'), quiet: true });

// 서버 시각은 항상 Asia/Seoul (절대 규칙 7)
process.env.TZ = 'Asia/Seoul';

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
