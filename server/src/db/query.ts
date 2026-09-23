import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { getPool } from './pool.js';

/**
 * 얇은 쿼리 레이어. ORM 없이 SQL을 직접 쓴다(원장·집계 쿼리는 반드시 SQL).
 * 트랜잭션 안에서는 conn을 넘겨 같은 연결을 쓴다.
 */
export type Params = Record<string, unknown> | unknown[];
export type Executor = PoolConnection | Pool;

// mysql2 의 QueryValues 타입은 namedPlaceholders 객체를 표현하지 못하므로 여기서만 좁혀 넘긴다.
type QueryValues = Parameters<Pool['query']>[1];
const values = (p: Params): QueryValues => p as unknown as QueryValues;

export async function query<T extends object = RowDataPacket>(
  sql: string,
  params: Params = [],
  conn: Executor = getPool(),
): Promise<T[]> {
  const [rows] = await conn.query<RowDataPacket[]>(sql, values(params));
  return rows as unknown as T[];
}

export async function queryOne<T extends object = RowDataPacket>(
  sql: string,
  params: Params = [],
  conn: Executor = getPool(),
): Promise<T | null> {
  const rows = await query<T>(sql, params, conn);
  return rows[0] ?? null;
}

export async function execute(
  sql: string,
  params: Params = [],
  conn: Executor = getPool(),
): Promise<ResultSetHeader> {
  const [result] = await conn.query<ResultSetHeader>(sql, values(params));
  return result;
}

/** INSERT 후 insertId 반환 */
export async function insert(
  sql: string,
  params: Params = [],
  conn: Executor = getPool(),
): Promise<number> {
  const result = await execute(sql, params, conn);
  return result.insertId;
}

/** 트랜잭션: 콜백이 예외를 던지면 롤백 */
export async function tx<T>(fn: (conn: PoolConnection) => Promise<T>): Promise<T> {
  const conn = await getPool().getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}
