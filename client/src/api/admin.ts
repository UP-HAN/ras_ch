import type {
  ClassView,
  ImportResult,
  SchoolYearView,
  TeacherUser,
  TeacherView,
} from '@server-types/api';
import { api } from './client';

export type GradeGroup = '3-4' | '5-6';

export const adminApi = {
  schoolYears: () => api.get<SchoolYearView[]>('/admin/school-years'),
  createSchoolYear: (input: {
    year: number;
    startDate: string;
    endDate: string;
    makeCurrent: boolean;
  }) => api.post<{ id: number }>('/admin/school-years', input),
  setCurrentSchoolYear: (id: number) =>
    api.put<{ updated: boolean }>(`/admin/school-years/${id}/current`),

  classes: () => api.get<ClassView[]>('/admin/classes'),
  createClass: (input: { grade: number; classNo: number }) =>
    api.post<{ id: number }>('/admin/classes', input),
  setHomeroom: (classId: number, teacherId: number | null) =>
    api.put<{ updated: boolean }>(`/admin/classes/${classId}/homeroom`, { teacherId }),
  setClassTeachers: (classId: number, teacherIds: number[]) =>
    api.put<{ updated: boolean }>(`/admin/classes/${classId}/teachers`, { teacherIds }),

  teachers: () => api.get<TeacherView[]>('/admin/teachers'),
  createTeacher: (input: {
    loginId: string;
    name: string;
    password?: string;
    isApprover: boolean;
    advisorGradeGroup: GradeGroup | null;
    role: 'teacher' | 'admin';
  }) => api.post<{ id: number; initialPassword: string }>('/admin/teachers', input),
  setTeacherRoles: (
    id: number,
    roles: { isApprover: boolean; advisorGradeGroup: GradeGroup | null },
  ) => api.put<{ updated: boolean }>(`/admin/teachers/${id}/roles`, roles),

  students: (classId: number) => api.get<TeacherUser[]>(`/admin/students?class_id=${classId}`),
  importStudents: (file: File, dryRun: boolean) => {
    const form = new FormData();
    form.append('file', file);
    return api.post<ImportResult>(`/admin/students/import?dry_run=${dryRun ? 1 : 0}`, form);
  },
  updateStudent: (
    id: number,
    patch: {
      parentConsent?: 'Y' | 'N';
      isReporter?: boolean;
      status?: 'active' | 'transferred' | 'graduated' | 'disabled';
    },
  ) => api.patch<{ updated: boolean }>(`/admin/students/${id}`, patch),
};
