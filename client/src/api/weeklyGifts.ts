import type { WeeklyGiftPanelView, WeeklyGiftResult } from '@server-types/api';
import { api } from './client';

/** 주간 선물 수시 지급 (HOF-01a, 01b). 승인 권한 교사 */
export const weeklyGiftsApi = {
  panel: (week: string) => api.get<WeeklyGiftPanelView>(`/admin/weekly/${week}/gifts`),
  grant: (week: string, input: { topN?: number; userIds?: number[]; note?: string }) =>
    api.post<WeeklyGiftResult>(`/admin/weekly/${week}/gifts`, input),
  cancel: (week: string, userId: number) =>
    api.delete<WeeklyGiftPanelView>(`/admin/weekly/${week}/gifts/${userId}`),
  csvUrl: (week: string) => `/api/v1/admin/weekly/${week}/gift-list.csv`,
};
