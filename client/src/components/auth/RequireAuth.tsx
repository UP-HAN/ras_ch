import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { Spinner } from '@/components/ui';
import { isTeacherRole, useMe } from '@/hooks/useMe';

/**
 * 라우트 가드 (클라이언트 편의용 — 실제 권한 검사는 서버 AUTH-07)
 *  - 미로그인 → /login
 *  - 비밀번호 변경 강제 → /change-password
 *  - area='teacher' 에 학생이 오면 → /, area='student' 에 교사가 오면 → /teacher
 */
export function RequireAuth({
  area,
  children,
}: {
  area: 'student' | 'teacher';
  children: ReactNode;
}) {
  const { me, isLoading } = useMe();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <Spinner size="lg" className="text-primary-600" />
      </div>
    );
  }
  if (!me) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (me.mustChangePw && location.pathname !== '/change-password') {
    return <Navigate to="/change-password" replace />;
  }
  const teacher = isTeacherRole(me);
  if (area === 'teacher' && !teacher) return <Navigate to="/" replace />;
  if (area === 'student' && teacher) return <Navigate to="/teacher" replace />;
  return <>{children}</>;
}
