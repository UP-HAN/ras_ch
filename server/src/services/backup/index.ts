/**
 * 백업 서비스 조립 (BKP-01~05): env 로부터 BackupService·DB 작업·복원 의존성을 만든다.
 * sharp 를 끌어오지 않도록 lib/image.ts 는 import 하지 않는다(복원 CLI 는 가볍게 떠야 한다).
 */
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mysql, { type RowDataPacket } from 'mysql2/promise';
import { env } from '../../config/env.js';
import { migrateUp, MIGRATIONS_DIR } from '../../db/migrate.js';
import { poolOptions } from '../../db/pool.js';
import { execute, queryOne } from '../../db/query.js';
import { logger } from '../../lib/logger.js';
import { writeAudit } from '../../repos/auditRepo.js';
import { BackupService } from './BackupService.js';
import type { RestoreDbOps } from './restore.js';
import { createSystemRunner, type BackupRunner } from './runner.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(here, '../../../..');

/** lib/image.ts 의 uploadRoot 와 같은 규칙(상대 경로면 리포 루트 기준) */
export function uploadDirAbs(): string {
  return path.isAbsolute(env.UPLOAD_DIR) ? env.UPLOAD_DIR : path.resolve(REPO_ROOT, env.UPLOAD_DIR);
}

export const backupsEnabled = (): boolean => env.BACKUP_DIR !== undefined;

export async function lastMigrationName(): Promise<string | null> {
  try {
    const row = await queryOne<{ name: string | null }>(
      'SELECT MAX(name) AS name FROM schema_migrations',
    );
    return row?.name ?? null;
  } catch {
    return null;
  }
}

export async function migrationFileNames(): Promise<string[]> {
  return (await fsp.readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith('.sql'));
}

export function createRunner(): BackupRunner {
  return createSystemRunner({
    mysqlBinDir: env.MYSQL_BIN_DIR,
    pm2Bin: env.PM2_BIN,
    db: {
      host: env.DB_HOST,
      port: env.DB_PORT,
      user: env.DB_USER,
      password: env.DB_PASSWORD,
      name: env.DB_NAME,
    },
  });
}

let instance: BackupService | null | undefined;

/** BACKUP_DIR 가 없으면 null (기능 꺼짐) */
export function getBackupService(): BackupService | null {
  if (instance !== undefined) return instance;
  if (!env.BACKUP_DIR) {
    instance = null;
    return null;
  }
  instance = new BackupService({
    root: env.BACKUP_DIR,
    dbName: env.DB_NAME,
    keepDays: env.BACKUP_KEEP_DAYS,
    uploadDir: uploadDirAbs(),
    runner: createRunner(),
    lastMigration: lastMigrationName,
    log: (msg, extra) => logger.info({ backup: true, ...extra }, msg),
  });
  return instance;
}

/** 복원 CLI 가 쓰는 DB 작업. 테이블 삭제는 풀이 아닌 전용 연결에서 FOREIGN_KEY_CHECKS=0 으로 */
export function createRestoreDbOps(): RestoreDbOps {
  return {
    async dropAllTables() {
      const conn = await mysql.createConnection(poolOptions);
      try {
        await conn.query('SET FOREIGN_KEY_CHECKS=0');
        const [tables] = await conn.query<RowDataPacket[]>(
          "SELECT table_name AS t FROM information_schema.tables WHERE table_schema = ? AND table_type = 'BASE TABLE'",
          [env.DB_NAME],
        );
        for (const r of tables)
          await conn.query(`DROP TABLE IF EXISTS \`${String(r.t).replace(/`/g, '``')}\``);
        const [views] = await conn.query<RowDataPacket[]>(
          "SELECT table_name AS t FROM information_schema.tables WHERE table_schema = ? AND table_type = 'VIEW'",
          [env.DB_NAME],
        );
        for (const r of views)
          await conn.query(`DROP VIEW IF EXISTS \`${String(r.t).replace(/`/g, '``')}\``);
        await conn.query('SET FOREIGN_KEY_CHECKS=1');
      } finally {
        await conn.end();
      }
    },
    migrateUp: () => migrateUp(),
    async clearSessions() {
      await execute('DELETE FROM sessions');
    },
    async writeAudit(entry) {
      // 복원 뒤의 DB 에는 요청한 관리자 계정이 없을 수 있어(FK) actor 는 null, 요청자는 payload 에
      await writeAudit({ actorId: null, ...entry });
    },
  };
}
