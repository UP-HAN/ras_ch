import { execute, queryOne } from '../db/query.js';

/** settings.value 는 JSON. 없으면 fallback */
export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const row = await queryOne<{ value: T }>('SELECT value FROM settings WHERE `key` = ?', [key]);
  return row ? row.value : fallback;
}

export async function setSetting(
  key: string,
  value: unknown,
  updatedBy: number | null,
): Promise<void> {
  await execute(
    'INSERT INTO settings (`key`, value, updated_by) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE value = VALUES(value), updated_by = VALUES(updated_by)',
    [key, JSON.stringify(value), updatedBy],
  );
}
