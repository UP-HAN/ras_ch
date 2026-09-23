/**
 * APR-07 자동 승격: pending 상태로 auto_escalate_hours(반→학년→학교, 기본 48) 를 넘긴 글에
 * escalated_at 을 찍고 review_logs(auto_escalate) 를 1회 남긴다. 교사 대기함 "미검토" 구간·배지에 쓰인다.
 */
import { execute, insert, query } from '../db/query.js';
import { logger } from '../lib/logger.js';
import { resolveApproval } from '../repos/approvalSettingsRepo.js';
import { setJobHandler } from './index.js';

interface Row {
  id: number;
  class_id: number;
  grade: number;
  hours_waiting: number;
}

export async function runAutoEscalate(): Promise<number> {
  const rows = await query<Row>(
    `SELECT id, class_id, grade, TIMESTAMPDIFF(HOUR, submitted_at, NOW(3)) AS hours_waiting
     FROM posts WHERE status = 'pending' AND deleted_at IS NULL AND escalated_at IS NULL AND submitted_at IS NOT NULL`,
  );
  let n = 0;
  for (const r of rows) {
    const setting = await resolveApproval(r.class_id, r.grade);
    if (setting.mode === 'teacher_only') continue;
    if (r.hours_waiting < setting.autoEscalateHours) continue;
    await execute('UPDATE posts SET escalated_at = NOW(3) WHERE id = ? AND escalated_at IS NULL', [
      r.id,
    ]);
    await insert(
      "INSERT INTO review_logs (post_id, actor_id, actor_role, action, note) VALUES (?, NULL, 'system', 'auto_escalate', ?)",
      [r.id, `${setting.autoEscalateHours}시간 동안 1차 검토가 없어 교사 대기함에 표시`],
    );
    n += 1;
  }
  if (n > 0) logger.info({ n }, '자동 승격');
  return n;
}

export function registerAutoEscalate(): void {
  setJobHandler('autoEscalate', async () => {
    await runAutoEscalate();
  });
}
