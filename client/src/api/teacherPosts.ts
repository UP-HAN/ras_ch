import type {
  BulkApproveResult,
  PendingCounts,
  PendingQueueView,
  RejectReasonCode,
  ReviewLogView,
  TeacherCommentView,
  TeacherPostListPage,
  TeacherPostView,
} from '@server-types/api';
import { api } from './client';

export interface PendingCountsView {
  total: number;
  byClass: Array<PendingCounts & { classId: number; className: string }>;
}

export const teacherPostsApi = {
  pending: (classId: number) => api.get<PendingQueueView>(`/teacher/classes/${classId}/pending`),
  pendingCounts: () => api.get<PendingCountsView>('/teacher/pending-counts'),
  /** 반 글 목록: 최신순, before 커서 (QA #8, #10) */
  posts: (classId: number, status: string, before?: string | null) =>
    api.get<TeacherPostListPage>(
      `/teacher/classes/${classId}/posts?status=${status}&type=all&limit=50${before ? `&before=${before}` : ''}`,
    ),
  /** 교사용 글 상세 (서버가 교사에게는 TeacherPostView 로 응답) */
  get: (id: number) => api.get<TeacherPostView>(`/posts/${id}`),
  /** 교사용 글 상세 댓글 (숨김 포함, 실명) */
  comments: (id: number) => api.get<TeacherCommentView[]>(`/teacher/posts/${id}/comments`),
  approve: (id: number) => api.post<TeacherPostView>(`/teacher/posts/${id}/approve`),
  reject: (id: number, reasonCode: RejectReasonCode, reasonText?: string) =>
    api.post<TeacherPostView>(`/teacher/posts/${id}/reject`, { reasonCode, reasonText }),
  hide: (id: number, reason?: string) =>
    api.post<TeacherPostView>(`/teacher/posts/${id}/hide`, { reason }),
  unhide: (id: number) => api.post<TeacherPostView>(`/teacher/posts/${id}/unhide`),
  bulkApprove: (ids: number[]) =>
    api.post<BulkApproveResult>('/teacher/posts/bulk-approve', { ids }),
  /** APR-05 1차 통과 글 전체 승인 */
  bulkApproveReviewed: (classId: number) =>
    api.post<BulkApproveResult>('/teacher/posts/bulk-approve', { stage: 'reviewed', classId }),
  /** APR-08 검토 이력 */
  history: (id: number) => api.get<ReviewLogView[]>(`/teacher/posts/${id}/history`),
};
