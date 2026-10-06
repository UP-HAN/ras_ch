import type {
  BugReportAdminListView,
  BugReportAdminView,
  BugReportMineView,
  BugReportView,
  BugStatusView,
} from '@server-types/api';
import { api } from './client';

export interface BugCreateInput {
  title: string;
  body: string;
  pagePath: string | null;
  photo: File | null;
}

/** 버그 신고 (BUG-01~04). 학생 화면에서는 "불편한 점 알리기"로 보여 준다 */
export const bugReportsApi = {
  create: (input: BugCreateInput) => {
    const fd = new FormData();
    fd.append('title', input.title);
    fd.append('body', input.body);
    if (input.pagePath) fd.append('pagePath', input.pagePath);
    if (input.photo) fd.append('photo', input.photo);
    return api.post<BugReportView>('/bug-reports', fd);
  },
  mine: () => api.get<BugReportMineView>('/bug-reports/mine'),

  // 관리자 전용 (BUG-03)
  adminList: (status?: BugStatusView) =>
    api.get<BugReportAdminListView>(`/admin/bug-reports${status ? `?status=${status}` : ''}`),
  adminOpenCount: () => api.get<{ open: number }>('/admin/bug-reports/count'),
  adminReply: (id: number, body: { status: BugStatusView; adminReply: string | null }) =>
    api.patch<BugReportAdminView>(`/admin/bug-reports/${id}`, body),
};
