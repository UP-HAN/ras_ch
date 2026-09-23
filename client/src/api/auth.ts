import type { LoginResult } from '@server-types/api';
import { api } from './client';

export const authApi = {
  login: (loginId: string, password: string) =>
    api.post<LoginResult>('/auth/login', { loginId, password }),
  logout: () => api.post<{ loggedOut: boolean }>('/auth/logout'),
  changePassword: (currentPassword: string, newPassword: string) =>
    api.post<{ changed: boolean }>('/auth/change-password', { currentPassword, newPassword }),
};
