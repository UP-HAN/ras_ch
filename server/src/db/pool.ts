import mysql, { type Pool, type PoolOptions } from 'mysql2/promise';
import { env } from '../config/env.js';

// DATETIME은 KST 벽시계 값으로 저장·조회한다 (docker-compose default-time-zone과 동일).
export const poolOptions: PoolOptions = {
  host: env.DB_HOST,
  port: env.DB_PORT,
  user: env.DB_USER,
  password: env.DB_PASSWORD,
  database: env.DB_NAME,
  charset: 'utf8mb4',
  timezone: '+09:00',
  namedPlaceholders: true,
  waitForConnections: true,
  connectionLimit: 10,
  supportBigNumbers: true,
  bigNumberStrings: false,
  decimalNumbers: true,
};

let pool: Pool | undefined;

export function getPool(): Pool {
  if (!pool) pool = mysql.createPool(poolOptions);
  return pool;
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = undefined;
  }
}

/** /healthz 등에서 DB 연결 확인용 */
export async function pingDb(): Promise<boolean> {
  try {
    const conn = await getPool().getConnection();
    try {
      await conn.ping();
      return true;
    } finally {
      conn.release();
    }
  } catch {
    return false;
  }
}
