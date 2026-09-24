/**
 * 댓글 직렬화 — 허용목록 (3.1: 학생 응답에 실명 없음)
 */
import { titleOf } from '../achievements.js';
import type { CommentView, TeacherCommentView } from '../../types/api.js';
import type { CommentBundle, TeacherCommentRow } from '../../repos/commentRepo.js';

export interface CommentExtras {
  /** 토론 찬반형: 작성자의 현재 투표 (NWS-07) */
  stance?: 'agree' | 'disagree' | null;
  /** 베스트 의견 (NWS-09) */
  isBest?: boolean;
}

export function toCommentView(
  b: CommentBundle,
  viewerId: number,
  likedByMe: boolean,
  extras: CommentExtras = {},
): CommentView {
  return {
    ...(extras.stance !== undefined ? { stance: extras.stance } : {}),
    ...(extras.isBest !== undefined ? { isBest: extras.isBest } : {}),
    id: b.comment.id,
    body: b.comment.body,
    likeCount: b.comment.like_count,
    likedByMe,
    isMine: b.comment.author_id === viewerId,
    createdAt: b.comment.created_at.toISOString(),
    author: {
      displayName: b.author.display_name,
      className: b.authorClass?.name ?? '',
      grade: b.authorClass?.grade ?? 0,
      tier: b.author.tier,
      title: titleOf(b.author.title_code),
      isReporter: b.author.is_reporter === 1,
    },
  };
}

export function toTeacherCommentView(
  r: TeacherCommentRow,
  bannedHits: string[],
): TeacherCommentView {
  return {
    id: r.id,
    body: r.body,
    status: r.status,
    likeCount: r.like_count,
    reportCount: Number(r.report_count),
    bannedHits,
    createdAt: r.created_at.toISOString(),
    hiddenReason: r.hidden_reason,
    author: {
      id: r.a_id,
      name: r.a_name,
      displayName: r.a_display_name,
      classId: r.a_class_id,
      className: r.c_name,
      grade: r.c_grade,
      studentNo: r.a_student_no,
    },
    target: {
      type: r.target_type,
      id: r.target_id,
      postType:
        r.target_type === 'news_topic' || r.target_type === 'council_post'
          ? r.target_type
          : r.p_type,
      title:
        r.target_type === 'news_topic'
          ? r.t_title
          : r.target_type === 'council_post'
            ? r.cp_title
            : (r.p_title ?? (r.p_body ? `${r.p_body}…` : null)),
      authorDisplayName:
        r.target_type === 'news_topic' || r.target_type === 'council_post'
          ? null
          : r.p_author_display,
    },
  };
}
