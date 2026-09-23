import type { BannedWordView, ReportItemView, TeacherCommentsPage } from '@server-types/api';
import { api } from './client';

export type CommentScope = 'class' | 'grade' | 'group';
export type CommentFlag = 'all' | 'reported' | 'banned';

export const teacherCommentsApi = {
  list: (p: {
    scope?: CommentScope;
    id?: string;
    flag?: CommentFlag;
    since?: string;
    cursor?: string | null;
  }) => {
    const q = new URLSearchParams();
    if (p.scope && p.id) {
      q.set('scope', p.scope);
      q.set('id', p.id);
    }
    if (p.flag && p.flag !== 'all') q.set('flag', p.flag);
    if (p.since) q.set('since', p.since);
    if (p.cursor) q.set('cursor', p.cursor);
    return api.get<TeacherCommentsPage>(`/teacher/comments?${q.toString()}`);
  },
  hide: (id: number, reason?: string) =>
    api.post<{ hidden: boolean }>(`/teacher/comments/${id}/hide`, { reason }),
  unhide: (id: number) => api.post<{ hidden: boolean }>(`/teacher/comments/${id}/unhide`),
  notify: (id: number, code: 'kind' | 'privacy' | 'spam' | 'hidden') =>
    api.post<{ notified: boolean }>(`/teacher/comments/${id}/notify`, { code }),
  checked: (scope: CommentScope, id: string) =>
    api.post<{ checked: boolean }>('/teacher/comments/checked', { scope, id }),

  reports: (status: 'open' | 'all') =>
    api.get<ReportItemView[]>(`/teacher/reports?status=${status}`),
  handleReport: (id: number, action: 'keep' | 'hide' | 'delete') =>
    api.post<{ handled: boolean }>(`/teacher/reports/${id}/handle`, { action }),

  bannedWords: () => api.get<BannedWordView[]>('/admin/banned-words'),
  addBannedWord: (word: string) => api.post<{ id: number }>('/admin/banned-words', { word }),
  setBannedWordActive: (id: number, isActive: boolean) =>
    api.patch<{ updated: boolean }>(`/admin/banned-words/${id}`, { isActive }),
};
