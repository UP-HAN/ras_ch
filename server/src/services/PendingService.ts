/**
 * 승인 대기 건수 (TCH-01, TCH-02, APR-07) — 대시보드·메뉴 배지·대기함이 같은 기준을 쓴다.
 *  - 대상 유형: 리포트·일기·기사 모두 (QA #3: 기사 대기 건이 빠지지 않게)
 *  - 기준 시간 초과(escalated)는 반별 승인 설정(autoEscalateHours)으로 판정
 */
import { query } from '../db/query.js';
import { resolveAllClasses } from '../repos/approvalSettingsRepo.js';
import type { PendingCounts } from '../types/api.js';
import type { PostStatus, PostType } from '../types/db.js';

export const PENDING_STATUSES: PostStatus[] = ['pending', 'reviewed', 'flagged'];
export const PENDING_TYPES: PostType[] = ['report', 'diary', 'article'];

export interface PendingLike {
  status: string;
  submitted_at: Date | null;
  escalated_at: Date | null;
}

/** APR-07: pending 상태로 기준 시간을 넘겼는가 (배치가 escalated_at 을 찍기 전에도 시간으로 판정) */
export function isEscalated(p: PendingLike, hours: number, now = Date.now()): boolean {
  return (
    p.status === 'pending' &&
    (p.escalated_at !== null ||
      (p.submitted_at !== null && now - p.submitted_at.getTime() >= hours * 3_600_000))
  );
}

export function countPending(posts: PendingLike[], hours: number): PendingCounts {
  return {
    reviewed: posts.filter((p) => p.status === 'reviewed').length,
    flagged: posts.filter((p) => p.status === 'flagged').length,
    pending: posts.filter((p) => p.status === 'pending').length,
    escalated: posts.filter((p) => isEscalated(p, hours)).length,
  };
}

interface PendingRow extends PendingLike {
  class_id: number;
}

/** 여러 반의 대기 건수를 한 번에 (반별 autoEscalateHours 반영) */
export async function pendingCountsByClass(
  classes: Array<{ id: number; grade: number }>,
): Promise<Map<number, PendingCounts>> {
  const out = new Map<number, PendingCounts>();
  if (classes.length === 0) return out;
  const settings = await resolveAllClasses(classes);
  const rows = await query<PendingRow>(
    `SELECT class_id, status, submitted_at, escalated_at FROM posts
     WHERE deleted_at IS NULL AND status IN (${PENDING_STATUSES.map(() => '?').join(',')})
       AND type IN (${PENDING_TYPES.map(() => '?').join(',')})
       AND class_id IN (${classes.map(() => '?').join(',')})`,
    [...PENDING_STATUSES, ...PENDING_TYPES, ...classes.map((c) => c.id)],
  );
  for (const c of classes) {
    out.set(
      c.id,
      countPending(
        rows.filter((r) => r.class_id === c.id),
        settings.get(c.id)?.autoEscalateHours ?? 48,
      ),
    );
  }
  return out;
}

export async function pendingCountsForClass(
  classId: number,
  grade: number,
): Promise<PendingCounts> {
  const m = await pendingCountsByClass([{ id: classId, grade }]);
  return m.get(classId) ?? { reviewed: 0, flagged: 0, pending: 0, escalated: 0 };
}
