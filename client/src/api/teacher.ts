import type { ClassView, ResetPasswordResult, TeacherUser } from '@server-types/api';
import { api } from './client';

export const teacherApi = {
  classes: () => api.get<ClassView[]>('/teacher/classes'),
  students: (classId: number) => api.get<TeacherUser[]>(`/teacher/classes/${classId}/students`),
  resetPassword: (studentId: number) =>
    api.post<ResetPasswordResult>(`/teacher/students/${studentId}/reset-password`),
};
