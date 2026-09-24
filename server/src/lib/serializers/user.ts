/**
 * 사용자 직렬화 — 허용목록 방식. 학생용(PublicUser)에는 실명(name)·login_id 가 없다 (3.1, 절대 규칙 4).
 */
import { titleOf } from '../achievements.js';
import type { MeView, PublicUser, TeacherUser } from '../../types/api.js';
import type { ClassRow, UserRow } from '../../types/db.js';

export interface UserBundle {
  user: UserRow;
  klass: Pick<ClassRow, 'id' | 'name' | 'grade'> | null;
  isCouncil: boolean;
}

export function toPublicUser(b: UserBundle): PublicUser {
  const { user, klass } = b;
  return {
    id: user.id,
    displayName: user.display_name,
    grade: klass?.grade ?? null,
    className: klass?.name ?? null,
    tier: user.tier,
    title: titleOf(user.title_code),
    isReporter: user.is_reporter === 1,
    isCouncil: b.isCouncil,
  };
}

export function toTeacherUser(b: UserBundle): TeacherUser {
  const { user } = b;
  return {
    ...toPublicUser(b),
    loginId: user.login_id,
    name: user.name,
    role: user.role,
    classId: user.class_id,
    studentNo: user.student_no,
    parentConsent: user.parent_consent,
    status: user.status,
    isApprover: user.is_approver === 1,
    advisorGradeGroup: user.advisor_grade_group,
    mustChangePw: user.must_change_pw === 1,
    lastLoginAt: user.last_login_at ? user.last_login_at.toISOString() : null,
  };
}

export function toMeView(b: UserBundle, actingAs: MeView['actingAs']): MeView {
  const { user } = b;
  return {
    ...toPublicUser(b),
    loginId: user.login_id,
    name: user.name,
    role: user.role,
    isApprover: user.is_approver === 1,
    advisorGradeGroup: user.advisor_grade_group,
    mustChangePw: user.must_change_pw === 1,
    parentConsent: user.parent_consent,
    actingAs,
    hasCouncilAccount: user.linked_council_account_id !== null,
    demoSiteUrl: null,
  };
}
