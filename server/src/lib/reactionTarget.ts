/**
 * 반응 대상 리졸버 (8.1 일반화): 댓글·좋아요·신고·읽기가 post / news_topic 을 같은 파이프라인으로 다룬다.
 *  - post       : 승인된 글 + 열람 권한(canViewPost). 소유자 = 작성자(본인 글 반응은 포인트 없음)
 *  - news_topic : live(마감 전)면 반응 가능, closed 는 열람만. 소유자 없음
 * 댓글 수 캐시 갱신도 여기서 대상별로 분기한다(신고 자동 숨김이 posts 를 잘못 깎던 버그 수정).
 */
import type { PoolConnection } from 'mysql2/promise';
import type { Executor } from '../db/query.js';
import { getPool } from '../db/pool.js';
import { AppError } from './apiResponse.js';
import { topicReactable } from './newsRules.js';
import { canViewPost, viewerFromAuthUser } from './postAccess.js';
import * as councilRepo from '../repos/councilRepo.js';
import * as newsRepo from '../repos/newsRepo.js';
import * as postRepo from '../repos/postRepo.js';
import type { AuthUser } from '../types/auth.js';

export type ReactionTargetType = 'post' | 'news_topic' | 'council_post';
export const REACTION_TARGET_TYPES: ReactionTargetType[] = ['post', 'news_topic', 'council_post'];

export function isReactionTargetType(v: string): v is ReactionTargetType {
  return (REACTION_TARGET_TYPES as string[]).includes(v);
}

export interface ReactionTarget {
  type: ReactionTargetType;
  id: number;
  /** 글 작성자(본인 반응 제외용). 토론 주제는 null */
  ownerId: number | null;
  /** 지금 반응(투표·댓글·좋아요) 가능한가 */
  canReact: boolean;
  /** 토론 주제 유형(댓글 규칙 코드·입장 배지용) */
  topicType?: 'vote' | 'open';
  /** false 면 댓글·좋아요 포인트를 주지 않는다 (자치회 글 CNC-06). 읽기 POST_READ 는 별도 */
  pointsEnabled: boolean;
}

/** 열람 가능한 대상을 찾는다. 없으면 404, 볼 수 없으면 403 */
export async function loadReactionTarget(
  user: AuthUser,
  type: string,
  id: number,
  conn?: PoolConnection,
): Promise<ReactionTarget> {
  if (type === 'post') {
    const post = await postRepo.findPostById(id, conn);
    if (!post || post.deleted_at) throw AppError.notFound('글을 찾을 수 없어요.');
    if (!canViewPost(viewerFromAuthUser(user), post))
      throw AppError.forbidden('이 글은 볼 수 없어요.');
    return {
      type: 'post',
      id,
      ownerId: post.author_id,
      canReact: post.status === 'approved',
      pointsEnabled: true,
    };
  }
  if (type === 'news_topic') {
    const topic = await newsRepo.findTopic(id, conn);
    if (!topic || !['live', 'closed'].includes(topic.status))
      throw AppError.notFound('토론 주제를 찾을 수 없어요.');
    return {
      type: 'news_topic',
      id,
      ownerId: null,
      canReact: topicReactable(topic.status, topic.close_at),
      topicType: topic.type,
      pointsEnabled: true,
    };
  }
  if (type === 'council_post') {
    // 자치회 글: 게시 중(approved·기간 내)이면 반응 가능(댓글 허용 시), 지난 글은 열람만. 포인트 없음(CNC-06)
    const post = await councilRepo.findPost(id, conn);
    if (!post || !['approved', 'expired'].includes(post.status))
      throw AppError.notFound('자치회 글을 찾을 수 없어요.');
    const now = new Date();
    const live = post.status === 'approved' && post.starts_at <= now && post.ends_at > now;
    return {
      type: 'council_post',
      id,
      ownerId: post.author_id,
      canReact: live && post.allow_comments === 1,
      pointsEnabled: false,
    };
  }
  throw AppError.badRequest('아직 지원하지 않는 대상이에요.');
}

/** 반응 가능해야 하는 곳(좋아요·댓글)에서 쓰는 도우미 */
export function assertReactable(t: ReactionTarget): void {
  if (t.canReact) return;
  throw AppError.conflict(
    t.type === 'news_topic'
      ? '마감된 토론이에요. 읽기만 할 수 있어요.'
      : t.type === 'council_post'
        ? '지금은 이 글에 댓글을 쓸 수 없어요.'
        : '게시된 글에만 반응할 수 있어요.',
  );
}

/** 댓글 수 캐시 갱신 — 대상별 분기 */
export async function bumpCommentCount(
  type: string,
  id: number,
  delta: number,
  conn: Executor = getPool(),
): Promise<void> {
  if (type === 'post') await postRepo.bumpCommentCount(id, delta, conn);
  else if (type === 'news_topic') await newsRepo.bumpTopicComments(id, delta, conn);
  else if (type === 'council_post') await councilRepo.bumpComments(id, delta, conn);
}
