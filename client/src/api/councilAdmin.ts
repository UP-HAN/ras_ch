import type {
  CouncilAdminPostView,
  CouncilMemberInput,
  CouncilMemberView,
} from '@server-types/api';
import { api } from './client';

/** 자치회 관리 (CNC-03, 04, 07 + 임원 지정). 승인 권한 교사 */
export const councilAdminApi = {
  members: () => api.get<CouncilMemberView[]>('/admin/council/members'),
  addMember: (input: CouncilMemberInput) =>
    api.post<CouncilMemberView>('/admin/council/members', input),
  removeMember: (id: number) => api.delete<{ removed: boolean }>(`/admin/council/members/${id}`),

  posts: (scope: 'pending' | 'approved' | 'all') =>
    api.get<CouncilAdminPostView[]>(`/admin/council/posts?scope=${scope}`),
  approve: (id: number, input: { isPinned: boolean; startsAt?: string; endsAt?: string }) =>
    api.post<CouncilAdminPostView>(`/admin/council/posts/${id}/approve`, input),
  reject: (id: number, reason: string) =>
    api.post<CouncilAdminPostView>(`/admin/council/posts/${id}/reject`, { reason }),
  pin: (id: number, isPinned: boolean) =>
    api.post<CouncilAdminPostView>(`/admin/council/posts/${id}/pin`, { isPinned }),
  hide: (id: number) => api.post<CouncilAdminPostView>(`/admin/council/posts/${id}/hide`),
  unhide: (id: number) => api.post<CouncilAdminPostView>(`/admin/council/posts/${id}/unhide`),
};
