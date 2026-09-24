import type {
  NewsAdminTopicView,
  NewsBankItemView,
  NewsBestResult,
  NewsProposalInput,
  NewsSettingsView,
  NewsTeacherTopicView,
} from '@server-types/api';
import { api } from './client';

/** 토론 주제 관리 (NWS-04, 05, 09): 교사 베스트 선정 + approver 예약·은행·설정 */
export const newsAdminApi = {
  closedForTeacher: () => api.get<NewsTeacherTopicView[]>('/teacher/news/closed'),
  selectBest: (topicId: number, commentIds: number[]) =>
    api.post<NewsBestResult>(`/teacher/news/topics/${topicId}/best`, { commentIds }),

  topics: (from?: string, to?: string) => {
    const q = new URLSearchParams();
    if (from) q.set('from', from);
    if (to) q.set('to', to);
    return api.get<NewsAdminTopicView[]>(`/admin/news/topics${q.size ? `?${q}` : ''}`);
  },
  createTopic: (input: NewsProposalInput & { publishAt: string }) =>
    api.post<NewsAdminTopicView>('/admin/news/topics', input),
  updateTopic: (id: number, input: NewsProposalInput & { publishAt?: string }) =>
    api.patch<NewsAdminTopicView>(`/admin/news/topics/${id}`, input),
  cancelTopic: (id: number) => api.post<{ cancelled: boolean }>(`/admin/news/topics/${id}/cancel`),
  publishNow: (id: number) => api.post<NewsAdminTopicView>(`/admin/news/topics/${id}/publish-now`),
  closeNow: (id: number) => api.post<NewsAdminTopicView>(`/admin/news/topics/${id}/close-now`),

  bank: () => api.get<NewsBankItemView[]>('/admin/news/bank'),
  createBank: (input: NewsProposalInput & { status?: 'ready' | 'reserve' }) =>
    api.post<NewsBankItemView>('/admin/news/bank', input),
  updateBank: (id: number, input: NewsProposalInput) =>
    api.patch<NewsBankItemView>(`/admin/news/bank/${id}`, input),
  setBankStatus: (id: number, status: 'ready' | 'reserve') =>
    api.post<NewsBankItemView>(`/admin/news/bank/${id}/status`, { status }),
  scheduleBank: (id: number, publishAt: string) =>
    api.post<NewsAdminTopicView>(`/admin/news/bank/${id}/schedule`, { publishAt }),
  deleteBank: (id: number) => api.delete<{ deleted: boolean }>(`/admin/news/bank/${id}`),

  settings: () => api.get<NewsSettingsView>('/admin/news/settings'),
  updateSettings: (
    input: Partial<
      Pick<
        NewsSettingsView,
        'perWeek' | 'hour' | 'durationDays' | 'bestPerGrade' | 'commentsPerTopic'
      >
    >,
  ) => api.put<NewsSettingsView>('/admin/news/settings', input),
  runJob: (job: 'reserve' | 'publish') =>
    api.post<Record<string, number | boolean>>('/admin/news/jobs/run', { job }),
};
