import type {
  BulkApproveResult,
  PendingCounts,
  PendingQueueView,
  RejectReasonCode,
  ReviewLogView,
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
  posts: (classId: number, status: string) =>
    api.get<TeacherPostView[]>(`/teacher/classes/${classId}/posts?status=${status}&type=all`),
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
