/**
 * 댓글 직렬화 — 허용목록 (3.1: 학생 응답에 실명 없음)
 */
import type { CommentView, TeacherCommentView } from '../../types/api.js';
import type { CommentBundle, TeacherCommentRow } from '../../repos/commentRepo.js';

export function toCommentView(b: CommentBundle, viewerId: number, likedByMe: boolean): CommentView {
  return {
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
      postType: r.p_type,
      title: r.p_title ?? (r.p_body ? `${r.p_body}…` : null),
      authorDisplayName: r.p_author_display,
    },
  };
}
