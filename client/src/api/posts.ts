import type {
  MyPostView,
  PostListPage,
  PublicSettingsView,
  StudentPostView,
  TeacherPostView,
  WeekContextView,
} from '@server-types/api';
import { api } from './client';

export interface ReportFormValues {
  type: 'report' | 'diary';
  weekKey: string;
  visibility: 'class' | 'school';
  avgMinutes: number | null;
  topCategory: string;
  topApp: string;
  body: string;
  goalText: string;
  goalAchieved: boolean | null;
  goalReason: string;
  submit: boolean;
}

function toForm(
  v: Partial<ReportFormValues>,
  files: { category?: File | null; app?: File | null },
) {
  const form = new FormData();
  for (const [k, val] of Object.entries(v)) {
    if (val === undefined || val === null) continue;
    form.append(k, String(val));
  }
  if (files.category) form.append('category_capture', files.category);
  if (files.app) form.append('app_capture', files.app);
  return form;
}

export const postsApi = {
  weekContext: () => api.get<WeekContextView>('/posts/week-context'),
  mine: () => api.get<MyPostView[]>('/posts/mine'),
  list: (scope: 'class' | 'school', cursor?: string | null) =>
    api.get<PostListPage<StudentPostView>>(
      `/posts?type=report&scope=${scope}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`,
    ),
  get: (id: number) => api.get<MyPostView | StudentPostView | TeacherPostView>(`/posts/${id}`),
  create: (v: ReportFormValues, files: { category?: File | null; app?: File | null }) =>
    api.post<MyPostView>('/posts', toForm(v, files)),
  update: (
    id: number,
    v: Omit<ReportFormValues, 'type' | 'weekKey'>,
    files: { category?: File | null; app?: File | null },
  ) => api.patch<MyPostView>(`/posts/${id}`, toForm(v, files)),
  remove: (id: number) => api.delete<{ deleted: boolean }>(`/posts/${id}`),
  settings: () => api.get<PublicSettingsView>('/settings/public'),
};
