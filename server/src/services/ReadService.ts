/**
 * 읽기 이벤트 (PT-10): 열람 시작은 서버 시각으로 기록, 10초 + 끝까지 스크롤이면 완료 → POST_READ
 * 본인 글·미승인 글은 대상 아님. 같은 글 1회(UQ), 일 5회는 규칙표 상한.
 */
import { tx } from '../db/query.js';
import { AppError } from '../lib/apiResponse.js';
import { canViewPost, viewerFromAuthUser } from '../lib/postAccess.js';
import { isReadComplete } from '../lib/readRules.js';
import * as postRepo from '../repos/postRepo.js';
import * as readRepo from '../repos/readRepo.js';
import type { AuthUser } from '../types/auth.js';
import type { ReadResult } from '../types/api.js';
import { applyPointsSafe } from './points/safeApply.js';
import { buildEventKey } from './points/types.js';

async function eligiblePost(user: AuthUser, postId: number): Promise<boolean> {
  if (user.row.role !== 'student') return false;
  const post = await postRepo.findPostById(postId);
  if (!post || post.deleted_at || post.status !== 'approved') return false;
  if (post.author_id === user.row.id) return false;
  return canViewPost(viewerFromAuthUser(user), post);
}

export async function openRead(user: AuthUser, postId: number): Promise<{ tracked: boolean }> {
  if (!(await eligiblePost(user, postId))) return { tracked: false };
  await readRepo.openRead(user.row.id, 'post', postId);
  return { tracked: true };
}

export async function completeRead(
  user: AuthUser,
  postId: number,
  scrolledToEnd: boolean,
): Promise<ReadResult> {
  if (!(await eligiblePost(user, postId))) return { completed: false, reason: 'NOT_ELIGIBLE' };
  return tx(async (conn) => {
    const row = await readRepo.findRead(user.row.id, 'post', postId, conn);
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
        refType: 'post',
        refId: postId,
        eventKey: buildEventKey('POST_READ', 'post', postId) + `:${user.row.id}`,
      },
      conn,
    );
    return { completed: true };
  });
}
