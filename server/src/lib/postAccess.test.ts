import { describe, expect, it } from 'vitest';
import {
  canManagePost,
  canViewPost,
  type PostAccessPost,
  type PostAccessViewer,
} from './postAccess.js';

const post = (over: Partial<PostAccessPost> = {}): PostAccessPost => ({
  author_id: 101,
  class_id: 10,
  grade: 5,
  status: 'approved',
  visibility: 'class',
  deleted_at: null,
  ...over,
});

const student = (id: number, classId: number): PostAccessViewer => ({
  id,
  role: 'student',
  classId,
  classIds: [],
  isApproverOrAdmin: false,
  advisorGrades: [],
});
const teacher = (over: Partial<PostAccessViewer> = {}): PostAccessViewer => ({
  id: 2,
  role: 'teacher',
  classId: null,
  classIds: [10],
  isApproverOrAdmin: false,
  advisorGrades: [],
  ...over,
});

// RPT-07 공개 범위
describe('canViewPost', () => {
  it('같은 반 학생은 승인된 글만 본다', () => {
    expect(canViewPost(student(102, 10), post())).toBe(true);
    expect(canViewPost(student(102, 10), post({ status: 'pending' }))).toBe(false);
  });

  it('다른 반 학생은 전교 공개일 때만', () => {
    expect(canViewPost(student(103, 20), post())).toBe(false);
    expect(canViewPost(student(103, 20), post({ visibility: 'school' }))).toBe(true);
    expect(canViewPost(student(103, 20), post({ visibility: 'school', status: 'pending' }))).toBe(
      false,
    );
  });

  it('본인은 어떤 상태든', () => {
    expect(canViewPost(student(101, 10), post({ status: 'draft' }))).toBe(true);
    expect(canViewPost(student(101, 10), post({ status: 'rejected' }))).toBe(true);
  });

  it('교사는 전교 열람, 삭제된 글도', () => {
    expect(canViewPost(teacher({ classIds: [] }), post({ status: 'pending', class_id: 99 }))).toBe(
      true,
    );
    expect(canViewPost(teacher(), post({ deleted_at: new Date() }))).toBe(true);
    expect(canViewPost(student(101, 10), post({ deleted_at: new Date() }))).toBe(false);
  });
});

// AUTH-07 타 반 관리 금지
describe('canManagePost', () => {
  it('담당 반 교사·admin/approver·학년군 지도교사만', () => {
    expect(canManagePost(teacher(), post())).toBe(true);
    expect(canManagePost(teacher({ classIds: [20] }), post())).toBe(false);
    expect(canManagePost(teacher({ classIds: [], isApproverOrAdmin: true }), post())).toBe(true);
    expect(canManagePost(teacher({ classIds: [], advisorGrades: [5, 6] }), post())).toBe(true);
    expect(canManagePost(teacher({ classIds: [], advisorGrades: [3, 4] }), post())).toBe(false);
  });

  it('학생·교사 검토 계정은 관리 불가', () => {
    expect(canManagePost(student(101, 10), post())).toBe(false);
    expect(canManagePost(teacher({ role: 'council_teacher' }), post())).toBe(false);
  });
});
