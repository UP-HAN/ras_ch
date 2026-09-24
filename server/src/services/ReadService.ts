/**
 * 읽기 이벤트 (PT-10): 열람 시작은 서버 시각으로 기록, 10초 + 끝까지 스크롤이면 완료 → POST_READ
 * 대상: 승인된 글(본인 글 제외) / 토론 주제(live·closed). 같은 대상 1회(UQ), 일 5회는 규칙표 상한.
 */
import { tx } from '../db/query.js';
import { AppError } from '../lib/apiResponse.js';
import { loadReactionTarget, type ReactionTargetType } from '../lib/reactionTarget.js';
import { isReadComplete } from '../lib/readRules.js';
import * as readRepo from '../repos/readRepo.js';
import type { AuthUser } from '../types/auth.js';
import type { ReadResult } from '../types/api.js';
import { applyPointsSafe } from './points/safeApply.js';
import { buildEventKey } from './points/types.js';

async function eligible(user: AuthUser, type: ReactionTargetType, id: number): Promise<boolean> {
  if (user.row.role !== 'student') return false;
  try {
    const t = await loadReactionTarget(user, type, id);
    if (t.type === 'post' && !t.canReact) return false; // 미승인 글
    return t.ownerId !== user.row.id;
  } catch {
    return false;
  }
}

export async function openRead(
  user: AuthUser,
  type: ReactionTargetType,
  id: number,
): Promise<{ tracked: boolean }> {
  if (!(await eligible(user, type, id))) return { tracked: false };
  await readRepo.openRead(user.row.id, type, id);
  return { tracked: true };
}

export async function completeRead(
  user: AuthUser,
  type: ReactionTargetType,
  id: number,
  scrolledToEnd: boolean,
): Promise<ReadResult> {
  if (!(await eligible(user, type, id))) return { completed: false, reason: 'NOT_ELIGIBLE' };
  return tx(async (conn) => {
    const row = await readRepo.findRead(user.row.id, type, id, conn);
    if (!row) throw AppError.badRequest('먼저 글을 열어야 해요.');
    const verdict = isReadComplete(
      row.opened_at,
      new Date(),
      scrolledToEnd,
      row.completed_at !== null,
    );
    if (!verdict.ok) return { completed: false, reason: verdict.reason };
    await readRepo.completeRead(row.id, conn);
    await applyPointsSafe(
      {
        ruleCode: 'POST_READ',
        userId: user.row.id,
        refType: type,
        refId: id,
        eventKey: buildEventKey('POST_READ', type, id) + `:${user.row.id}`,
      },
      conn,
    );
    return { completed: true };
  });
}
