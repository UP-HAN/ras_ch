import type { BonusResult, PointsSummaryView } from '@server-types/api';
import { api } from './client';

export type PointsRange = 'week' | 'month' | 'all';

export const pointsApi = {
  /** PT-06 내 포인트 합계·내역 */
  mine: (range: PointsRange = 'week') => api.get<PointsSummaryView>(`/me/points?range=${range}`),
  /** PT-04 교사 칭찬 포인트 */
  bonus: (studentId: number, amount: number, reason: string) =>
    api.post<BonusResult>(`/teacher/students/${studentId}/bonus`, { amount, reason }),
};
