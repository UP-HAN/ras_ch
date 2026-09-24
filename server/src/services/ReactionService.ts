/**
 * 반응: 좋아요·댓글·신고 (RCT-01~06, 8.1 일반화) — 리포트·기사·토론 주제 공통
 *  - 대상은 lib/reactionTarget 리졸버로 푼다 (post / news_topic). 본인 글에 대한 좋아요·댓글은 포인트 대상 아님(RCT-06)
 *  - 토론 의견 댓글은 NEWS_OPINION(COMMENT_WRITTEN 과 일 5회 합산), 입장 배지는 현재 투표를 join (NWS-07)
 *  - 신고 3건(서로 다른 학생) → 자동 숨김(RCT-05)
 */
import type { PoolConnection } from 'mysql2/promise';
import { tx } from '../db/query.js';
import { AppError } from '../lib/apiResponse.js';
import { bannedWordMessage, findBannedWords } from '../lib/bannedWords.js';
import { notify } from '../lib/notify.js';
import { isTeacherLike, viewerFromAuthUser } from '../lib/postAccess.js';
import {
  assertReactable,
  bumpCommentCount,
  loadReactionTarget,
  type ReactionTarget,
} from '../lib/reactionTarget.js';
import { toCommentView } from '../lib/serializers/comment.js';
import { writeAudit } from '../repos/auditRepo.js';
import { listActiveBannedWords } from '../repos/bannedWordRepo.js';
import * as commentRepo from '../repos/commentRepo.js';
import * as likeRepo from '../repos/likeRepo.js';
import * as councilRepo from '../repos/councilRepo.js';
import * as newsRepo from '../repos/newsRepo.js';
import * as postRepo from '../repos/postRepo.js';
import * as reportRepo from '../repos/reportRepo.js';
import { getSetting } from '../repos/settingsRepo.js';
import type { AuthUser } from '../types/auth.js';
import type { LikeResult, PostReactionsView, ReportResult } from '../types/api.js';
import { applyPointsSafe, reversePointsSafe } from './points/safeApply.js';
import { evaluateSafe as evaluateAchievements } from './AchievementService.js';
import { buildEventKey } from './points/types.js';
import { transition } from './PostService.js';

export const COMMENT_MIN = 10;
export const COMMENT_MAX = 300;
export const COMMENTS_PER_POST = 3;
export const REPORT_AUTO_HIDE_AT = 3;
export const AUTO_HIDE_REASON = '신고가 여러 번 들어와 자동으로 숨겼어요. 선생님이 확인할 거예요.';

const charLen = (s: string) => Array.from(s).length;

/** 반응 가능한 대상(승인 글 / live 토론)을 찾는다 */
async function loadReactable(
  user: AuthUser,
  type: string,
  id: number,
  conn?: PoolConnection,
): Promise<ReactionTarget> {
  const t = await loadReactionTarget(user, type, id, conn);
  assertReactable(t);
  return t;
}

// ---------- 좋아요 ----------

export async function setLike(
  user: AuthUser,
  targetType: 'post' | 'comment' | 'council_post',
  targetId: number,
  on: boolean,
): Promise<LikeResult> {
  return tx(async (conn) => {
    let ownerId: number;
    let pointsEnabled: boolean;
    if (targetType === 'post' || targetType === 'council_post') {
      const t = await loadReactable(user, targetType, targetId, conn);
      ownerId = t.ownerId as number;
      pointsEnabled = t.pointsEnabled;
    } else {
      const c = await commentRepo.findComment(targetId, conn, true);
      if (!c || c.comment.status !== 'visible') throw AppError.notFound('댓글을 찾을 수 없어요.');
      const t = await loadReactable(user, c.comment.target_type, c.comment.target_id, conn);
      ownerId = c.comment.author_id;
      pointsEnabled = t.pointsEnabled;
    }

    const existing = await likeRepo.findLike(user.row.id, targetType, targetId, conn);
    let likeCount: number;
    if (on) {
      if (!existing) {
        const likeId = await likeRepo.insertLike(user.row.id, targetType, targetId, conn);
        likeCount =
          targetType === 'post'
            ? await likeRepo.bumpPostLikes(targetId, 1, conn)
            : targetType === 'council_post'
              ? await councilRepo.bumpLikes(targetId, 1, conn)
              : (await commentRepo.bumpCommentLikes(targetId, 1, conn),
                (await commentRepo.findComment(targetId, conn))?.comment.like_count ?? 0);
        // 포인트 (RCT-06: 본인 글·댓글은 제외, 학생만, 자치회 글은 없음 CNC-06)
        if (pointsEnabled && user.row.role === 'student' && ownerId !== user.row.id) {
          await applyPointsSafe(
            {
              ruleCode: 'LIKE_GIVEN',
              userId: user.row.id,
              refType: 'like',
              refId: likeId,
              eventKey: buildEventKey('LIKE_GIVEN', 'like', likeId),
            },
            conn,
          );
          const received = targetType === 'post' ? 'LIKE_RECEIVED_POST' : 'LIKE_RECEIVED_COMMENT';
          await applyPointsSafe(
            {
              ruleCode: received,
              userId: ownerId,
              refType: 'like',
              refId: likeId,
              // 상한은 "게시글당 20 / 댓글당 5" → 상한 객체는 대상 글·댓글 (PT-02)
              capObject: { type: targetType, id: targetId },
              eventKey: buildEventKey(received, 'like', likeId),
            },
            conn,
          );
        }
        if (ownerId !== user.row.id) await evaluateAchievements(ownerId, conn); // 인기글
      } else {
        likeCount =
          targetType === 'post'
            ? await likeRepo.bumpPostLikes(targetId, 0, conn)
            : targetType === 'council_post'
              ? await councilRepo.bumpLikes(targetId, 0, conn)
              : ((await commentRepo.findComment(targetId, conn))?.comment.like_count ?? 0);
      }
      return { liked: true, likeCount };
    }
    if (existing) {
      await likeRepo.deleteLike(existing.id, conn);
      likeCount =
        targetType === 'post'
          ? await likeRepo.bumpPostLikes(targetId, -1, conn)
          : targetType === 'council_post'
            ? await councilRepo.bumpLikes(targetId, -1, conn)
            : (await commentRepo.bumpCommentLikes(targetId, -1, conn),
              (await commentRepo.findComment(targetId, conn))?.comment.like_count ?? 0);
      await reversePointsSafe(
        'like',
        existing.id,
        { note: 'like.cancel', actorId: user.row.id },
        conn,
      );
    } else {
      likeCount =
        targetType === 'post'
          ? await likeRepo.bumpPostLikes(targetId, 0, conn)
          : ((await commentRepo.findComment(targetId, conn))?.comment.like_count ?? 0);
    }
    return { liked: false, likeCount };
  });
}

// ---------- 댓글 ----------

export async function addComment(
  user: AuthUser,
  targetType: string,
  targetId: number,
  bodyRaw: string,
): Promise<commentRepo.CommentBundle> {
  const body = bodyRaw.trim();
  const len = charLen(body);
  if (len < COMMENT_MIN || len > COMMENT_MAX) {
    throw AppError.badRequest(
      `댓글은 ${COMMENT_MIN}~${COMMENT_MAX}자로 써 주세요. (지금 ${len}자)`,
    );
  }
  const hits = findBannedWords(body, await listActiveBannedWords());
  if (hits.length > 0) throw AppError.badRequest(bannedWordMessage(hits));

  return tx(async (conn) => {
    const target = await loadReactable(user, targetType, targetId, conn);
    if (user.row.role === 'student') {
      const n = await commentRepo.countByAuthorTarget(user.row.id, target.type, targetId, conn);
      if (n >= COMMENTS_PER_POST)
        throw AppError.conflict(`한 글에는 댓글을 ${COMMENTS_PER_POST}개까지 쓸 수 있어요.`);
    }
    const id = await commentRepo.insertComment(target.type, targetId, user.row.id, body, conn);
    await bumpCommentCount(target.type, targetId, 1, conn);
    // 토론 의견은 NEWS_OPINION, 글 댓글은 COMMENT_WRITTEN (본인 글 제외, 자치회 글은 없음 CNC-06)
    if (target.pointsEnabled && user.row.role === 'student' && target.ownerId !== user.row.id) {
      const rule = target.type === 'news_topic' ? 'NEWS_OPINION' : 'COMMENT_WRITTEN';
      await applyPointsSafe(
        {
          ruleCode: rule,
          userId: user.row.id,
          refType: 'comment',
          refId: id,
          eventKey: buildEventKey(rule, 'comment', id),
        },
        conn,
      );
    }
    if (user.row.role === 'student') await evaluateAchievements(user.row.id, conn); // 응원왕·토론가
    const bundle = await commentRepo.findComment(id, conn);
    if (!bundle) throw AppError.notFound('댓글을 찾을 수 없어요.');
    return bundle;
  });
}

export async function deleteComment(user: AuthUser, commentId: number): Promise<void> {
  await tx(async (conn) => {
    const c = await commentRepo.findComment(commentId, conn, true);
    if (!c || c.comment.status === 'deleted') throw AppError.notFound('댓글을 찾을 수 없어요.');
    if (c.comment.author_id !== user.row.id) throw AppError.forbidden('내 댓글만 지울 수 있어요.');
    await commentRepo.setCommentStatus(commentId, 'deleted', null, null, conn);
    if (c.comment.status === 'visible')
      await bumpCommentCount(c.comment.target_type, c.comment.target_id, -1, conn);
    await reversePointsSafe(
      'comment',
      commentId,
      { note: 'comment.delete', actorId: user.row.id },
      conn,
    );
  });
}

/** 상세 화면용: 좋아요 상태 + 댓글 목록(토론이면 입장·베스트 배지) + 내 댓글 수 + 안내 문구 */
export async function reactionsFor(
  user: AuthUser,
  targetType: string,
  targetId: number,
): Promise<PostReactionsView> {
  const target = await loadReactionTarget(user, targetType, targetId);
  const comments = await commentRepo.listVisibleByTarget(target.type, targetId);
  const likedComments = await likeRepo.likedTargetIds(
    user.row.id,
    'comment',
    comments.map((c) => c.comment.id),
  );
  let stances = new Map<number, 'agree' | 'disagree'>();
  let bests = new Set<number>();
  if (target.type === 'news_topic') {
    if (target.topicType === 'vote')
      stances = await newsRepo.votesByUsers(
        targetId,
        comments.map((c) => c.comment.author_id),
      );
    bests = await newsRepo.bestCommentIds([targetId]);
  }
  let likedByMe = false;
  let likeCount = 0;
  if (target.type === 'post') {
    const post = await postRepo.findPostById(targetId);
    likedByMe = !!(await likeRepo.findLike(user.row.id, 'post', targetId));
    likeCount = post?.like_count ?? 0;
  } else if (target.type === 'council_post') {
    const post = await councilRepo.findPost(targetId);
    likedByMe = !!(await likeRepo.findLike(user.row.id, 'council_post', targetId));
    likeCount = post?.like_count ?? 0;
  }
  return {
    likedByMe,
    likeCount,
    comments: comments.map((c) =>
      toCommentView(c, user.row.id, likedComments.has(c.comment.id), {
        stance:
          target.type === 'news_topic' ? (stances.get(c.comment.author_id) ?? null) : undefined,
        isBest: target.type === 'news_topic' ? bests.has(c.comment.id) : undefined,
      }),
    ),
    myCommentCount: comments.filter((c) => c.comment.author_id === user.row.id).length,
    goodCommentGuide: await getSetting('good_comment_guide', ''),
  };
}

// ---------- 신고 ----------

export async function report(
  user: AuthUser,
  targetType: 'post' | 'comment',
  targetId: number,
  reasonRaw: string,
  ip?: string,
): Promise<ReportResult> {
  const reason = reasonRaw.trim();
  if (charLen(reason) < 2 || charLen(reason) > 200)
    throw AppError.badRequest('신고 이유를 2~200자로 적어 주세요.');
  if (isTeacherLike(viewerFromAuthUser(user)))
    throw AppError.forbidden('선생님은 신고 대신 바로 숨길 수 있어요.');

  const result = await tx(async (conn) => {
    let ownerId: number;
    if (targetType === 'post') {
      const t = await loadReactable(user, 'post', targetId, conn);
      ownerId = t.ownerId as number;
    } else {
      const c = await commentRepo.findComment(targetId, conn);
      if (!c || c.comment.status !== 'visible') throw AppError.notFound('댓글을 찾을 수 없어요.');
      ownerId = c.comment.author_id;
    }
    if (ownerId === user.row.id)
      throw AppError.badRequest('내 글은 신고할 수 없어요. 지우고 싶으면 삭제해 주세요.');
    try {
      await reportRepo.insertReport(user.row.id, targetType, targetId, reason, conn);
    } catch (err) {
      if ((err as { code?: string }).code === 'ER_DUP_ENTRY')
        throw AppError.conflict('이미 신고한 글이에요. 선생님이 확인할 거예요.');
      throw err;
    }
    await writeAudit(
      {
        actorId: user.row.id,
        action: 'report.create',
        targetType,
        targetId,
        payload: { reason },
        ip,
      },
      conn,
    );
    const n = await reportRepo.countOpenReports(targetType, targetId, conn);
    return { n, ownerId };
  });

  let autoHidden = false;
  if (result.n >= REPORT_AUTO_HIDE_AT) {
    if (targetType === 'post') {
      const post = await postRepo.findPostById(targetId);
      if (post && post.status === 'approved') {
        await transition(targetId, 'hide', 'system', { hiddenReason: AUTO_HIDE_REASON });
        autoHidden = true;
      }
    } else {
      const c = await commentRepo.findComment(targetId);
      if (c && c.comment.status === 'visible') {
        await tx(async (conn) => {
          await commentRepo.setCommentStatus(targetId, 'hidden', null, AUTO_HIDE_REASON, conn);
          // 대상별 분기: 토론 댓글이면 news_topics.comment_count 만 줄어든다
          await bumpCommentCount(c.comment.target_type, c.comment.target_id, -1, conn);
          await reversePointsSafe('comment', targetId, { note: 'comment.auto_hide' }, conn);
          await notify(c.comment.author_id, 'comment_hidden', { message: AUTO_HIDE_REASON }, conn);
        });
        autoHidden = true;
      }
    }
  }
  return { reported: true, autoHidden };
}
