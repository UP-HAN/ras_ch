/**
 * notices (ADM-04): 홈 상단 배너, 기간 설정
 */
import { execute, insert, query, queryOne } from '../db/query.js';

export interface NoticeRow {
  id: number;
  title: string;
  body: string;
  starts_at: Date;
  ends_at: Date;
  author_id: number;
  is_active: 0 | 1;
  author_name: string | null;
}

const SELECT =
  'SELECT n.*, u.name AS author_name FROM notices n LEFT JOIN users u ON u.id = n.author_id';

export async function listAll(): Promise<NoticeRow[]> {
  return query<NoticeRow>(`${SELECT} ORDER BY n.starts_at DESC, n.id DESC`);
}

export async function listActive(limit = 3): Promise<NoticeRow[]> {
  return query<NoticeRow>(
    `${SELECT} WHERE n.is_active = 1 AND n.starts_at <= NOW(3) AND n.ends_at >= NOW(3) ORDER BY n.starts_at DESC, n.id DESC LIMIT ?`,
    [limit],
  );
}

export async function findById(id: number): Promise<NoticeRow | null> {
  return queryOne<NoticeRow>(`${SELECT} WHERE n.id = ?`, [id]);
}

export interface NoticeInput {
  title: string;
  body: string;
  startsAt: string;
  endsAt: string;
  isActive: boolean;
}

export async function insertNotice(n: NoticeInput, authorId: number): Promise<number> {
  return insert(
    'INSERT INTO notices (title, body, starts_at, ends_at, author_id, is_active) VALUES (?, ?, ?, ?, ?, ?)',
    [n.title, n.body, n.startsAt, n.endsAt, authorId, n.isActive ? 1 : 0],
  );
}

export async function updateNotice(id: number, n: NoticeInput): Promise<void> {
  await execute(
    'UPDATE notices SET title = ?, body = ?, starts_at = ?, ends_at = ?, is_active = ? WHERE id = ?',
    [n.title, n.body, n.startsAt, n.endsAt, n.isActive ? 1 : 0, id],
  );
}

export async function deleteNotice(id: number): Promise<void> {
  await execute('DELETE FROM notices WHERE id = ?', [id]);
}
