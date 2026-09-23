import type {
  ApprovalSettingView,
  PointCapView,
  PointRuleView,
  ReviewAssignmentView,
  ReviewerCandidateView,
} from '@server-types/api';
import { api } from './client';

export interface PointRuleInput {
  amount: number;
  amountMin: number | null;
  amountMax: number | null;
  caps: PointCapView[];
  isActive: boolean;
}

export interface ApprovalSettingInput {
  scope: 'school' | 'grade' | 'class';
  scopeId: number | null;
  mode: 'two_step' | 'teacher_only';
  autoEscalateHours: number;
  autoApproveTeacherReview: boolean;
}

export interface AssignmentInput {
  grades: number[];
  postTypes: string[];
  allowedResults: 'pass_only' | 'pass_hold';
  dailyCap: number;
  preset: 'assist' | 'basic' | 'senior' | 'custom';
  startsAt: string;
  endsAt: string | null;
  isActive: boolean;
}

/** 관리자 S4 설정: 규칙표(PT-05), 승인 모드(APR-01), 검토 담당(APR-02), 교사 검토 계정(APR-12) */
export const adminSettingsApi = {
  pointRules: () => api.get<PointRuleView[]>('/admin/point-rules'),
  updatePointRule: (code: string, input: PointRuleInput) =>
    api.put<PointRuleView>(`/admin/point-rules/${code}`, input),

  approvalSettings: () => api.get<ApprovalSettingView[]>('/admin/approval-settings'),
  saveApprovalSetting: (input: ApprovalSettingInput) =>
    api.put<{ saved: boolean }>('/admin/approval-settings', input),
  deleteApprovalSetting: (scope: 'grade' | 'class', scopeId: number) =>
    api.delete<{ deleted: boolean }>(`/admin/approval-settings/${scope}/${scopeId}`),

  reviewAssignments: () => api.get<ReviewAssignmentView[]>('/admin/review-assignments'),
  reviewerCandidates: () =>
    api.get<ReviewerCandidateView[]>('/admin/review-assignments/candidates'),
  createAssignment: (reviewerUserId: number, input: AssignmentInput) =>
    api.post<{ id: number }>('/admin/review-assignments', { reviewerUserId, ...input }),
  updateAssignment: (id: number, input: AssignmentInput) =>
    api.put<{ updated: boolean }>(`/admin/review-assignments/${id}`, input),
  deactivateAssignment: (id: number) =>
    api.delete<{ deactivated: boolean }>(`/admin/review-assignments/${id}`),

  createCouncilAccount: (teacherId: number) =>
    api.post<{ id: number; loginId: string; password: string }>(
      `/admin/teachers/${teacherId}/council-account`,
    ),
  rebuildPoints: (from: string, to: string) =>
    api.post<{ applied: number; reversed: number }>('/admin/points/rebuild', { from, to }),
};
