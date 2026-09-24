import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { authApi } from '@/api/auth';
import { reviewApi } from '@/api/review';
import { teacherPostsApi } from '@/api/teacherPosts';
import { useMe, useMeCache } from '@/hooks/useMe';
import { cn } from '@/lib/cn';
import { CloseIcon, MenuIcon } from './icons';

/**
 * 교사 셸 (PRD 6.2, 6.3): PC 우선 좌측 메뉴 240px. 1024px 미만은 상단 햄버거 드로어.
 * 관리자 섹션은 role=admin 일 때만 보인다(서버도 별도로 403 검사).
 */
const TEACHER_MENU = [
  { to: '/teacher', label: '반 대시보드', end: true },
  { to: '/teacher/pending', label: '승인 대기함' },
  { to: '/teacher/posts', label: '반 글 목록' },
  { to: '/teacher/students', label: '학생 관리' },
  { to: '/teacher/comments', label: '댓글 모아보기' },
  { to: '/teacher/reports', label: '신고함' },
  { to: '/teacher/stats', label: '통계' },
  { to: '/teacher/hall-of-fame', label: '명예의 전당' },
  { to: '/teacher/news', label: '토론 주제' },
  { to: '/teacher/council', label: '자치회' },
];

const ADMIN_MENU = [
  { to: '/teacher/admin/school', label: '학교 설정' },
  { to: '/teacher/admin/students-import', label: '학생 CSV 등록' },
  { to: '/teacher/admin/banned-words', label: '금칙어' },
  { to: '/teacher/admin/point-rules', label: '포인트 규칙' },
  { to: '/teacher/admin/approval', label: '승인·검토 설정' },
  { to: '/teacher/admin/settlements', label: '월간 결산' },
  { to: '/teacher/admin/content', label: '공지·문구' },
  { to: '/teacher/admin/insights', label: '실천 변화 리포트' },
];

function MenuList({
  items,
  onNavigate,
  badges = {},
}: {
  items: typeof TEACHER_MENU;
  onNavigate?: () => void;
  badges?: Record<string, number>;
}) {
  return (
    <ul className="space-y-1">
      {items.map((m) => (
        <li key={m.to}>
          <NavLink
            to={m.to}
            end={'end' in m ? m.end : false}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                'flex min-h-tap items-center rounded-md px-3 text-base font-semibold',
                isActive ? 'bg-accent-600 text-white' : 'text-accent-900 hover:bg-accent-100',
              )
            }
          >
            {m.label}
            {badges[m.to] ? (
              <span className="ml-auto rounded-full bg-danger-600 px-2 py-0.5 text-base font-bold text-white">
                {badges[m.to]}
              </span>
            ) : null}
          </NavLink>
        </li>
      ))}
    </ul>
  );
}

export function TeacherShell() {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  const { me } = useMe();
  const cache = useMeCache();
  const navigate = useNavigate();
  const counts = useQuery({
    queryKey: ['teacher', 'pending-counts'],
    queryFn: teacherPostsApi.pendingCounts,
    refetchInterval: 60_000,
  });

  const logout = async () => {
    await authApi.logout();
    cache.clear();
    navigate('/login', { replace: true });
  };
  const toCouncil = async () => {
    await reviewApi.switchRole('council');
    cache.clear();
    navigate('/', { replace: true });
  };

  const nav = (
    <nav aria-label="교사 메뉴" className="flex h-full flex-col gap-6 p-4">
      <div className="text-xl font-extrabold text-accent-700">
        <span aria-hidden="true">🏮</span> 초롱 RAS 포인트
        <div className="text-base font-medium text-ink-muted">교사 화면</div>
      </div>
      <MenuList
        items={TEACHER_MENU}
        onNavigate={close}
        badges={{ '/teacher/pending': counts.data?.total ?? 0 }}
      />
      {me?.role === 'admin' && (
        <div>
          <p className="mb-1 px-3 text-base font-bold text-ink-muted">관리자</p>
          <MenuList items={ADMIN_MENU} onNavigate={close} />
          {me.demoSiteUrl && (
            <a
              href={me.demoSiteUrl}
              target="_blank"
              rel="noreferrer"
              data-testid="demo-site-link"
              className="mt-2 flex min-h-tap items-center rounded-md border border-dashed border-accent-300 px-3 text-base font-semibold text-accent-700 hover:bg-accent-50"
            >
              🎭 시연 사이트 (가상 데이터) ↗
            </a>
          )}
        </div>
      )}
      <div className="mt-auto border-t border-line pt-4">
        <p className="px-3 text-base font-semibold">{me?.name}</p>
        <p className="px-3 text-base text-ink-muted">
          {me?.role === 'admin' ? '관리자' : '교사'}
          {me?.isApprover ? ' · 승인 권한' : ''}
          {me?.advisorGradeGroup ? ` · ${me.advisorGradeGroup}학년군 지도` : ''}
        </p>
        {me?.hasCouncilAccount && (
          <button
            type="button"
            data-testid="switch-council"
            onClick={toCouncil}
            className="mt-2 min-h-tap w-full rounded-md bg-accent-100 px-3 text-base font-bold text-accent-900 hover:bg-accent-200"
          >
            자치회 검토 모드로 전환
          </button>
        )}
        <div className="mt-2 flex gap-1 px-1">
          <button
            type="button"
            onClick={() => navigate('/change-password')}
            className="min-h-tap flex-1 rounded-md px-2 text-base text-accent-900 hover:bg-accent-100"
          >
            비밀번호
          </button>
          <button
            type="button"
            onClick={logout}
            className="min-h-tap flex-1 rounded-md px-2 text-base text-accent-900 hover:bg-accent-100"
          >
            로그아웃
          </button>
        </div>
      </div>
    </nav>
  );

  return (
    <div className="min-h-dvh bg-paper lg:flex">
      <aside className="hidden w-sidebar shrink-0 border-r border-line bg-surface lg:block">
        {nav}
      </aside>

      <div className="flex-1">
        <header className="sticky top-0 z-10 flex h-14 items-center gap-3 border-b border-line bg-surface px-4 lg:hidden">
          <button
            type="button"
            aria-label={open ? '메뉴 닫기' : '메뉴 열기'}
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
            className="flex min-h-tap min-w-tap items-center justify-center rounded-md text-accent-700 hover:bg-accent-50"
          >
            {open ? <CloseIcon /> : <MenuIcon />}
          </button>
          <span className="text-lg font-extrabold text-accent-700">초롱 RAS 포인트 · 교사</span>
        </header>
        {open && (
          <div className="fixed inset-0 z-20 lg:hidden" role="dialog" aria-modal="true">
            <button
              type="button"
              aria-label="메뉴 닫기"
              className="absolute inset-0 bg-accent-900/40"
              onClick={() => setOpen(false)}
            />
            <aside className="absolute inset-y-0 left-0 w-sidebar bg-surface shadow-card">
              {nav}
            </aside>
          </div>
        )}

        <main className="mx-auto w-full max-w-[1200px] px-4 py-6 lg:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
