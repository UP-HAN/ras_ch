import type { ReviewQueueItem, ReviewSummaryView } from '@server-types/api';
import { api } from './client';

export interface ReviewSubmitInput {
  result: 'pass' | 'hold';
  checklist: Record<string, boolean>;
  note?: string;
}

/** 자치회 1차 검토 (APR-02~04, 12, 13) */
export const reviewApi = {
  summary: () => api.get<ReviewSummaryView>('/council/review/summary'),
  queue: () => api.get<ReviewQueueItem[]>('/council/review/queue'),
  post: (id: number) => api.get<ReviewQueueItem>(`/council/review/posts/${id}`),
  submit: (id: number, input: ReviewSubmitInput) =>
    api.post<{ status: string; autoApproved: boolean }>(`/council/review/posts/${id}`, input),
  switchRole: (to: 'teacher' | 'council') =>
    api.post<{ actingAs: 'council' | null }>('/me/switch-role', { to }),
};
