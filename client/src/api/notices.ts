import type { NoticeView, TextsView } from '@server-types/api';
import { api } from './client';

export interface NoticeInput {
  title: string;
  body: string;
  startsAt: string;
  endsAt: string;
  isActive: boolean;
}

/** 공지 (ADM-04) + 안내 문구 (ADM-07) */
export const noticesApi = {
  list: () => api.get<NoticeView[]>('/admin/notices'),
  create: (input: NoticeInput) => api.post<{ id: number }>('/admin/notices', input),
  update: (id: number, input: NoticeInput) =>
    api.put<{ updated: boolean }>(`/admin/notices/${id}`, input),
  remove: (id: number) => api.delete<{ deleted: boolean }>(`/admin/notices/${id}`),
  texts: () => api.get<TextsView>('/admin/texts'),
  updateTexts: (t: TextsView) => api.put<TextsView>('/admin/texts', t),
};
