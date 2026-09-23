import type { HomeView, MeView, NotificationView } from '@server-types/api';
import { api } from './client';

export const meApi = {
  me: () => api.get<MeView>('/me'),
  home: () => api.get<HomeView>('/me/home'),
  notifications: (limit = 20) => api.get<NotificationView[]>(`/me/notifications?limit=${limit}`),
  readNotification: (id: number) => api.post<{ read: boolean }>(`/me/notifications/${id}/read`),
};
