/**
 * 게시글 열람·관리 권한 (RPT-07 공개 범위, AUTH-07, 절대 규칙 2) — 순수 함수
 *  - 본인: 어떤 상태든 열람
 *  - 교사·관리자·검토 계정: 전교 열람(3장 교사 권한)
 *  - 학생: approved 이고 (같은 반 이거나 전교 공개)
 *  - 삭제된 글은 교사만(이력 확인용)
 */
import type { AuthUser } from '../types/auth.js';
import { advisorGrades, hasRole } from '../types/auth.js';
import type { PostStatus, Role, Visibility } from '../types/db.js';

export interface PostAccessViewer {
  id: number;
  role: Role;
  classId: number | null;
  /** 교사: 담임·배정 반 */
  classIds: number[];
  isApproverOrAdmin: boolean;
  advisorGrades: number[];
}

export interface PostAccessPost {
  author_id: number;
  class_id: number;
  grade: number;
  status: PostStatus;
  visibility: Visibility;
  deleted_at: Date | null;
}

export function viewerFromAuthUser(u: AuthUser): PostAccessViewer {
  return {
    id: u.row.id,
    role: u.row.role,
    classId: u.row.class_id,
    classIds: u.classIds,
    isApproverOrAdmin: hasRole(u, 'admin') || hasRole(u, 'approver'),
    advisorGrades: advisorGrades(u),
  };
}

const TEACHER_ROLES: Role[] = ['teacher', 'admin', 'council_teacher'];

export function isTeacherLike(viewer: PostAccessViewer): boolean {
  return TEACHER_ROLES.includes(viewer.role);
}

export function canViewPost(viewer: PostAccessViewer, post: PostAccessPost): boolean {
  if (post.deleted_at) return isTeacherLike(viewer);
  if (post.author_id === viewer.id) return true;
  if (isTeacherLike(viewer)) return true;
  if (post.status !== 'approved') return false;
  return post.class_id === viewer.classId || post.visibility === 'school';
}

/** 승인·반려·숨김 등 관리 권한: 그 반을 담당하는 교사 */
export function canManagePost(viewer: PostAccessViewer, post: PostAccessPost): boolean {
  if (!isTeacherLike(viewer) || viewer.role === 'council_teacher') return false;
  if (viewer.isApproverOrAdmin) return true;
  if (viewer.classIds.includes(post.class_id)) return true;
  return viewer.advisorGrades.includes(post.grade);
}
