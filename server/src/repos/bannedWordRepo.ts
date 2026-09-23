import { execute, insert, query } from '../db/query.js';

export interface BannedWordRow {
  id: number;
  word: string;
  is_active: 0 | 1;
  created_at: Date;
}

export async function listActiveBannedWords(): Promise<string[]> {
  const rows = await query<{ word: string }>('SELECT word FROM banned_words WHERE is_active = 1');
  return rows.map((r) => r.word);
}

export async function listBannedWords(): Promise<BannedWordRow[]> {
  return query<BannedWordRow>('SELECT * FROM banned_words ORDER BY is_active DESC, word');
}

export async function insertBannedWord(word: string): Promise<number> {
  return insert(
    'INSERT INTO banned_words (word, is_active) VALUES (?, 1) ON DUPLICATE KEY UPDATE is_active = 1, id = LAST_INSERT_ID(id)',
    [word],
  );
}

export async function setBannedWordActive(id: number, active: boolean): Promise<void> {
  await execute('UPDATE banned_words SET is_active = ? WHERE id = ?', [active ? 1 : 0, id]);
}
