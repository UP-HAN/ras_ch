import type { BackupListView } from '@server-types/api';
import { api } from './client';

/** 백업·복원 (BKP-01~04, 관리자 전용) */
export const backupsApi = {
  list: () => api.get<BackupListView>('/admin/backups'),
  create: (label: string) => api.post<{ id: string }>('/admin/backups', { label }),
  remove: (id: string) => api.delete<{ deleted: boolean }>(`/admin/backups/${id}`),
  restore: (id: string) =>
    api.post<{ id: string }>(`/admin/backups/${id}/restore`, { confirmId: id }),
};
