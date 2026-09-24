/**
 * 계정 삭제 (관리자, ADM-01 보강 — 시범 명단 정리용)
 *  - 활동 기록(글·댓글·좋아요·포인트·투표·검토·감사 로그 등)이 있는 계정은 삭제하지 않고 409 → 상태 '중지' 권고
 *  - 활동이 없으면 부속 행(출석·알림·읽기·임원·검토 담당·담임 배정 등)을 정리하고 users 행을 지운다
 *  - users 를 참조하는 FK 는 information_schema 로 찾으므로 표가 늘어도 자동으로 다룬다
 */
import type { PoolConnection } from 'mysql2/promise';
import { execute, query, queryOne, tx } from '../db/query.js';
import { AppError } from '../lib/apiResponse.js';
import { writeAudit } from '../repos/auditRepo.js';
import * as userRepo from '../repos/userRepo.js';
import type { UserRow } from '../types/db.js';

interface Actor {
  id: number;
  ip?: string;
}

/** 이 표에 행이 있으면 "활동 기록"으로 보고 삭제를 막는다 */
const ACTIVITY_TABLES = new Set([
  'posts',
  'comments',
  'likes',
  'reports',
  'point_ledger',
  'point_rule_history',
  'council_posts',
  'council_poll_votes',
  'news_votes',
  'news_best_opinions',
  'news_topics',
  'news_topic_bank',
  'weekly_gifts',
  'review_logs',
  'comment_review_checks',
  'monthly_scores',
  'monthly_awards',
  'monthly_settlements',
  'audit_logs',
  'notices',
]);

interface FkRef {
  table: string;
  column: string;
  nullable: boolean;
}

async function userForeignKeys(conn: PoolConnection): Promise<FkRef[]> {
  return (
    await query<{ t: string; c: string; n: string }>(
      `SELECT k.TABLE_NAME AS t, k.COLUMN_NAME AS c, col.IS_NULLABLE AS n
       FROM information_schema.KEY_COLUMN_USAGE k
       JOIN information_schema.COLUMNS col
         ON col.TABLE_SCHEMA = k.TABLE_SCHEMA AND col.TABLE_NAME = k.TABLE_NAME AND col.COLUMN_NAME = k.COLUMN_NAME
       WHERE k.TABLE_SCHEMA = DATABASE() AND k.REFERENCED_TABLE_NAME = 'users'`,
      [],
      conn,
    )
  ).map((r) => ({ table: r.t, column: r.c, nullable: r.n === 'YES' }));
}

export interface DeleteResult {
  deleted: boolean;
  /** 삭제하지 못한 이유(활동 기록 표 이름) */
  blockedBy: string[];
}

async function deleteOne(
  actor: Actor,
  user: UserRow,
  conn: PoolConnection,
  fks: FkRef[],
): Promise<DeleteResult> {
  // 교사에 연결된 자치회 검토 계정은 먼저 지운다 (APR-12)
  if (user.linked_council_account_id) {
    const linked = await queryOne<UserRow>(
      'SELECT * FROM users WHERE id = ? FOR UPDATE',
      [user.linked_council_account_id],
      conn,
    );
    await execute(
      'UPDATE users SET linked_council_account_id = NULL WHERE id = ?',
      [user.id],
      conn,
    );
    if (linked) {
      const r = await deleteOne(actor, linked, conn, fks);
      if (!r.deleted) return r;
    }
  }
  const blockedBy: string[] = [];
  for (const fk of fks) {
    if (fk.table === 'users') continue;
    if (!ACTIVITY_TABLES.has(fk.table)) continue;
    const r = await queryOne<{ n: number }>(
      `SELECT COUNT(*) AS n FROM \`${fk.table}\` WHERE \`${fk.column}\` = ?`,
      [user.id],
      conn,
    );
    if (Number(r?.n ?? 0) > 0 && !blockedBy.includes(fk.table)) blockedBy.push(fk.table);
  }
  if (blockedBy.length > 0) return { deleted: false, blockedBy };
  // 부속 행 정리: NULL 허용 컬럼은 NULL 로, 아니면 행 삭제
  for (const fk of fks) {
    if (fk.table === 'users') continue;
    if (fk.nullable)
      await execute(
        `UPDATE \`${fk.table}\` SET \`${fk.column}\` = NULL WHERE \`${fk.column}\` = ?`,
        [user.id],
        conn,
      );
    else await execute(`DELETE FROM \`${fk.table}\` WHERE \`${fk.column}\` = ?`, [user.id], conn);
  }
  await execute(
    'UPDATE users SET linked_council_account_id = NULL WHERE linked_council_account_id = ?',
    [user.id],
    conn,
  );
  await execute('DELETE FROM users WHERE id = ?', [user.id], conn);
  await writeAudit(
    {
      actorId: actor.id,
      action: 'user.delete',
      targetType: 'user',
      targetId: user.id,
      payload: { loginId: user.login_id, role: user.role, classId: user.class_id },
      ip: actor.ip,
    },
    conn,
  );
  return { deleted: true, blockedBy: [] };
}

export const BLOCKED_MESSAGE =
  '활동 기록(글·댓글·포인트 등)이 있어서 지울 수 없어요. 대신 상태를 "중지"로 바꿔 주세요.';

export async function deleteUser(actor: Actor, userId: number): Promise<void> {
  if (userId === actor.id) throw AppError.badRequest('내 계정은 지울 수 없어요.');
  const user = await userRepo.findUserById(userId);
  if (!user) throw AppError.notFound('계정을 찾을 수 없어요.');
  if (user.role === 'admin') {
    const admins = await queryOne<{ n: number }>(
      "SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND status = 'active'",
    );
    if (Number(admins?.n ?? 0) <= 1)
      throw AppError.badRequest('마지막 관리자 계정은 지울 수 없어요.');
  }
  const result = await tx(async (conn) => {
    const fks = await userForeignKeys(conn);
    const row = await queryOne<UserRow>(
      'SELECT * FROM users WHERE id = ? FOR UPDATE',
      [userId],
      conn,
    );
    if (!row) throw AppError.notFound('계정을 찾을 수 없어요.');
    return deleteOne(actor, row, conn, fks);
  });
  if (!result.deleted) throw AppError.conflict(BLOCKED_MESSAGE);
}

export interface BulkDeleteResult {
  deleted: number;
  /** 활동 기록이 있어 남긴 학생 (실명, 교사 화면) */
  skipped: Array<{ id: number; name: string; studentNo: number | null }>;
}

/** 반의 학생 전체 삭제 — 활동 없는 학생만 지우고 나머지는 남긴다 (시범 명단 → 실제 CSV 교체용) */
export async function deleteClassStudents(
  actor: Actor,
  classId: number,
): Promise<BulkDeleteResult> {
  const students = await userRepo.listStudentsByClass(classId);
  const out: BulkDeleteResult = { deleted: 0, skipped: [] };
  await tx(async (conn) => {
    const fks = await userForeignKeys(conn);
    for (const s of students) {
      const row = await queryOne<UserRow>(
        'SELECT * FROM users WHERE id = ? FOR UPDATE',
        [s.id],
        conn,
      );
      if (!row) continue;
      const r = await deleteOne(actor, row, conn, fks);
      if (r.deleted) out.deleted += 1;
      else out.skipped.push({ id: s.id, name: s.name, studentNo: s.student_no });
    }
  });
  return out;
}
