import type { GamifySettingsView, MyAchievementsView } from '@server-types/api';
import { api } from './client';

/** 게이미피케이션: 등급 진행·칭호 수집·대표 칭호 (학생), 설정 (관리자) */
export const gamifyApi = {
  myAchievements: () => api.get<MyAchievementsView>('/me/achievements'),
  setTitle: (code: string | null) => api.put<{ titleCode: string | null }>('/me/title', { code }),
  settings: () => api.get<GamifySettingsView>('/admin/gamify-settings'),
  updateSettings: (input: GamifySettingsView) =>
    api.put<GamifySettingsView>('/admin/gamify-settings', input),
};
