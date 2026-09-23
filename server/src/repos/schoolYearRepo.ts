import { execute, insert, query, queryOne, type Executor } from '../db/query.js';
import { getPool } from '../db/pool.js';
import type { SchoolYearRow } from '../types/db.js';

export async function currentSchoolYear(conn: Executor = getPool()): Promise<SchoolYearRow | null> {
  return queryOne<SchoolYearRow>(
    'SELECT * FROM school_years WHERE is_current = 1 LIMIT 1',
    [],
    conn,
  );
}

export async function listSchoolYears(): Promise<SchoolYearRow[]> {
  return query<SchoolYearRow>('SELECT * FROM school_years ORDER BY year DESC');
}

export async function insertSchoolYear(
  year: number,
  startDate: string,
  endDate: string,
): Promise<number> {
  return insert(
    'INSERT INTO school_years (year, start_date, end_date, is_current) VALUES (?, ?, ?, 0)',
    [year, startDate, endDate],
  );
}

export async function setCurrentSchoolYear(id: number): Promise<void> {
  await execute('UPDATE school_years SET is_current = IF(id = ?, 1, 0)', [id]);
}
