import { insert, type Executor } from '../db/query.js';
import { getPool } from '../db/pool.js';

/**
 * 관리자·담임 변경 API 감사 로그 (PRD 10장). payload 에 이름·비밀번호는 넣지 않는다(절대 규칙 8).
 */
export interface AuditEntry {
  actorId: number | null;
  action: string;
  targetType?: string;
  targetId?: number;
  payload?: Record<string, unknown>;
  ip?: string;
}

export async function writeAudit(e: AuditEntry, conn: Executor = getPool()): Promise<void> {
  await insert(
    'INSERT INTO audit_logs (actor_id, action, target_type, target_id, payload, ip) VALUES (?, ?, ?, ?, ?, ?)',
    [
      e.actorId,
      e.action,
      e.targetType ?? null,
      e.targetId ?? null,
      e.payload ? JSON.stringify(e.payload) : null,
      e.ip ?? null,
    ],
    conn,
  );
}
