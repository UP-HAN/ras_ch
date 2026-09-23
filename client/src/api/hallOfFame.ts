import type { AllTimeView, ClassHallView, MonthlyHallView, WeeklyTopView } from '@server-types/api';
import { api } from './client';

/** 명예의 전당 (HOF-01, 06). 학생 응답에는 순위·포인트·실명이 없다 */
export const hallApi = {
  weekly: (week?: string) =>
    api.get<WeeklyTopView>(`/hall-of-fame/weekly${week ? `?week=${week}` : ''}`),
  monthly: (month?: string) =>
    api.get<MonthlyHallView>(`/hall-of-fame/monthly${month ? `?month=${month}` : ''}`),
  classes: () => api.get<ClassHallView>('/hall-of-fame/classes'),
  allTime: () => api.get<AllTimeView>('/hall-of-fame/all-time'),
};
