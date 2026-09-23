import type {
  BulkApproveResult,
  PendingQueueView,
  RejectReasonCode,
  TeacherPostView,
} from '@server-types/api';
import { api } from './client';

export const teacherPostsApi = {
  pending: (classId: number) => api.get<PendingQueueView>(`/teacher/classes/${classId}/pending`),
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
};
