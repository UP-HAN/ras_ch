import type {
  ClassView,
  CouncilMemberView,
  ImportResult,
  ResetPasswordResult,
  TeacherUser,
} from '@server-types/api';
import { api } from './client';

export interface AddStudentInput {
  studentNo: number;
  name: string;
  parentConsent: 'Y' | 'N';
  isReporter: boolean;
  /** 비우면 자동 생성 */
  initialPassword: string | null;
}

export const teacherApi = {
  classes: () => api.get<ClassView[]>('/teacher/classes'),
  students: (classId: number) => api.get<TeacherUser[]>(`/teacher/classes/${classId}/students`),
  resetPassword: (studentId: number) =>
    api.post<ResetPasswordResult>(`/teacher/students/${studentId}/reset-password`),

  // 담임·배정 교사의 학생 관리 (자기 반만, 다른 반은 403)
  addStudent: (classId: number, input: AddStudentInput) =>
    api.post<ImportResult>(`/teacher/classes/${classId}/students`, input),
  editStudent: (studentId: number, patch: { isReporter?: boolean; parentConsent?: 'Y' | 'N' }) =>
    api.patch<{ updated: boolean }>(`/teacher/students/${studentId}`, patch),
  deleteStudent: (studentId: number) =>
    api.delete<{ deleted: boolean }>(`/teacher/students/${studentId}`),
  setCouncil: (
    studentId: number,
    input: { title: string; termStart: string; termEnd: string | null },
  ) => api.post<CouncilMemberView>(`/teacher/students/${studentId}/council`, input),
  clearCouncil: (studentId: number) =>
    api.delete<{ removed: boolean }>(`/teacher/students/${studentId}/council`),
};
