/**
 * 인앱 알림 (CMN-03): 승인·반려·숨김·안내 등을 notifications 에 쌓고 홈 카드로 보여 준다. 푸시 없음.
 * payload.message 는 학생이 읽는 문구, link 는 눌렀을 때 갈 곳.
 */
import type { Executor } from '../db/query.js';
import { insert } from '../db/query.js';
import { getPool } from '../db/pool.js';

export type NotificationType =
  | 'post_approved'
  | 'post_rejected'
  | 'post_hidden'
  | 'comment_hidden'
  | 'comment_notice'
  | 'points'
  | 'award'
  | 'news_bank_low';

export interface NotificationPayload {
  message: string;
  link?: string;
  [k: string]: unknown;
}

export async function notify(
  userId: number,
  type: NotificationType,
  payload: NotificationPayload,
  conn: Executor = getPool(),
): Promise<number> {
  return insert(
    'INSERT INTO notifications (user_id, type, payload) VALUES (?, ?, ?)',
    [userId, type, JSON.stringify(payload)],
    conn,
  );
}

/** 교사가 댓글 작성자에게 보내는 정형 안내 문구 (TCH-06). 코드만 API 로 받고 문구는 서버가 정한다 */
export const COMMENT_NOTICES = {
  kind: '친구가 기분 좋을 말로 댓글을 써 주세요. 칭찬·질문·응원이 좋은 댓글이에요.',
  privacy: '댓글에 친구의 이름이나 개인정보를 적지 않도록 해요.',
  spam: '같은 댓글을 여러 번 달지 말고, 글을 읽고 생각을 적어 주세요.',
  hidden: '선생님이 댓글을 숨겼어요. 이유가 궁금하면 선생님께 물어보세요.',
} as const;
export type CommentNoticeCode = keyof typeof COMMENT_NOTICES;
