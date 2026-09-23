/**
 * 마이그레이션 러너: `tsx src/db/migrate.ts up | status | reset`
 * - server/migrations/NNN_name.sql 을 번호 순으로 적용하고 schema_migrations에 기록
 * - reset 은 개발 전용(스키마 DROP 후 재생성). NODE_ENV=production 이면 거부
 * - mysql CLI 없이 mysql2 만으로 동작
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';
import { env, isProd } from '../config/env.js';
import { closePool, getPool, poolOptions } from './pool.js';
import { sortMigrationFiles, splitSqlStatements } from './migrateCore.js';

const here = path.dirname(fileURLToPath(import.meta.url));
export const MIGRATIONS_DIR = path.resolve(here, '../../migrations');

async function ensureTable(): Promise<void> {
  await getPool().query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name VARCHAR(100) NOT NULL PRIMARY KEY,
    applied_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`);
}

async function appliedNames(): Promise<Set<string>> {
  const [rows] = await getPool().query<mysql.RowDataPacket[]>(
    'SELECT name FROM schema_migrations ORDER BY name',
  );
  return new Set(rows.map((r) => String(r.name)));
}

async function listFiles(): Promise<string[]> {
  const names = await fs.readdir(MIGRATIONS_DIR);
  return sortMigrationFiles(names);
}

export async function migrateUp(): Promise<string[]> {
  await ensureTable();
  const applied = await appliedNames();
  const files = await listFiles();
  const ran: string[] = [];
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = await fs.readFile(path.join(MIGRATIONS_DIR, file), 'utf8');
    const statements = splitSqlStatements(sql);
    const conn = await getPool().getConnection();
    try {
      // DDL은 MySQL에서 자동 커밋되므로 문장 단위로 실행하고, 실패 시 어느 문장인지 알려준다.
      for (const stmt of statements) {
        try {
          await conn.query(stmt);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          throw new Error(`[${file}] 실행 실패: ${msg}\n--- 문장 ---\n${stmt.slice(0, 400)}`, {
            cause: err,
          });
        }
      }
      await conn.query('INSERT INTO schema_migrations (name) VALUES (?)', [file]);
      ran.push(file);
      console.log(`applied  ${file}`);
    } finally {
      conn.release();
    }
  }
  if (ran.length === 0) console.log('적용할 마이그레이션이 없습니다.');
  return ran;
}

export async function migrateStatus(): Promise<void> {
  await ensureTable();
  const applied = await appliedNames();
  const files = await listFiles();
  for (const file of files) {
    console.log(`${applied.has(file) ? '[x]' : '[ ]'} ${file}`);
  }
}

/** 개발 전용: 스키마를 통째로 지우고 다시 만든 뒤 up */
export async function migrateReset(): Promise<void> {
  if (isProd) throw new Error('production 환경에서는 reset을 실행할 수 없습니다.');
  const root = await mysql.createConnection({
    ...poolOptions,
    database: undefined,
    user: env.DB_ROOT_PASSWORD ? 'root' : poolOptions.user,
    password: env.DB_ROOT_PASSWORD ?? poolOptions.password,
  });
  try {
    await root.query(`DROP DATABASE IF EXISTS \`${env.DB_NAME}\``);
    await root.query(
      `CREATE DATABASE \`${env.DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`,
    );
    console.log(`스키마 ${env.DB_NAME} 재생성`);
  } finally {
    await root.end();
  }
  await migrateUp();
}

const isCli =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isCli) {
  const cmd = process.argv[2] ?? 'up';
  const run = async () => {
    if (cmd === 'up') await migrateUp();
    else if (cmd === 'status') await migrateStatus();
    else if (cmd === 'reset') await migrateReset();
    else throw new Error(`알 수 없는 명령: ${cmd} (up | status | reset)`);
  };
  run()
    .catch((err) => {
      console.error(err instanceof Error ? err.message : err);
      process.exitCode = 1;
    })
    .finally(() => closePool());
}
