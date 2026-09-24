import type { ClassDashboardView, InsightsView, SchoolStatsView } from '@server-types/api';
import { api } from './client';

/** 대시보드·통계 (TCH-01, 05, ADM-05) */
export const statsApi = {
  classDashboard: (classId: number) =>
    api.get<ClassDashboardView>(`/teacher/classes/${classId}/dashboard`),
  classCsvUrl: (classId: number) => `/api/v1/teacher/classes/${classId}/export.csv`,
  school: () => api.get<SchoolStatsView>('/admin/stats'),
  insights: () => api.get<InsightsView>('/admin/insights'),
};
