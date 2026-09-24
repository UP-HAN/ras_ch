import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { reviewApi } from '@/api/review';
import { postsApi } from '@/api/posts';
import { useQuery } from '@tanstack/react-query';
import { DemoBanner } from './DemoBanner';
import { useMe, useMeCache } from '@/hooks/useMe';
import { cn } from '@/lib/cn';
import { ChatIcon, HomeIcon, PencilIcon, TrophyIcon, UserIcon } from './icons';

/**
 * 학생 셸 (PRD 6.1, CMN-01): 모바일 우선, 하단 탭 5개.
 * 토론방(P2-1)은 /debate. 비활성 탭 표시 코드는 다음 기능(자치회 게시판 등)을 위해 남겨 둔다.
 */
const TABS = [
  { to: '/', label: '홈', Icon: HomeIcon, end: true },
  { to: '/write', label: '글쓰기', Icon: PencilIcon },
  { to: '/debate', label: '토론방', Icon: ChatIcon },
  // 360px 에서 탭 폭이 72px 이라 두 줄로 나눠 보여 준다
  { to: '/hall-of-fame', label: '명예의\n전당', Icon: TrophyIcon },
  { to: '/me', label: '내 정보', Icon: UserIcon },
] as const;

export function StudentShell() {
  const { me } = useMe();
  const cache = useMeCache();
  const navigate = useNavigate();
  const canReview = !!me && (me.isCouncil || me.role === 'council_teacher');
  const pub = useQuery({ queryKey: ['settings', 'public'], queryFn: postsApi.settings, enabled: !!me });
  const backToTeacher = async () => {
    await reviewApi.switchRole('teacher');
    cache.clear();
    navigate('/teacher', { replace: true });
  };
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[480px] flex-col">
      {pub.data?.demoMode && <DemoBanner />}
      <header className="sticky top-0 z-10 flex h-14 items-center justify-between border-b border-line bg-paper/95 px-4 backdrop-blur">
        <a
          href="/"
          className="flex min-h-tap items-center gap-2 text-lg font-extrabold text-accent-600"
        >
          <span aria-hidden="true">🏮</span> 초롱 RAS 포인트
        </a>
        {canReview && (
          <NavLink
            to="/review"
            className={({ isActive }) =>
              cn(
                'inline-flex min-h-tap items-center rounded-md px-3 text-base font-bold',
                isActive ? 'bg-accent-600 text-white' : 'bg-accent-100 text-accent-900',
              )
            }
          >
            🔍 검토
          </NavLink>
        )}
      </header>
      {me?.role === 'council_teacher' && (
        <div
          data-testid="council-banner"
          className="flex items-center justify-between gap-2 bg-accent-600 px-4 py-2 text-base font-semibold text-white"
        >
          <span>자치회 검토 모드예요</span>
          {me.actingAs === 'council' && (
            <button
              type="button"
              onClick={backToTeacher}
              className="min-h-tap rounded-md bg-white px-3 text-base font-bold text-accent-700"
            >
              교사 화면으로 돌아가기
            </button>
          )}
        </div>
      )}

      <main className="flex-1 px-4 pb-[calc(var(--spacing-tab-bar)+16px)] pt-4">
        <Outlet />
      </main>

      <nav
        aria-label="주요 메뉴"
        className="fixed inset-x-0 bottom-0 z-10 border-t border-line bg-surface safe-bottom"
      >
        <ul className="mx-auto grid h-tab-bar max-w-[480px] grid-cols-5">
          {TABS.map(({ to, label, Icon, ...t }) => (
            <li key={to} className="flex">
              {'disabled' in t && t.disabled ? (
                <span
                  aria-disabled="true"
                  title="곧 열려요"
                  className="flex min-h-tap flex-1 flex-col items-center justify-center gap-0.5 text-ink-muted/60"
                >
                  <Icon />
                  <span className="text-base leading-tight whitespace-pre-line text-center">
                    {label}
                  </span>
                  <span className="sr-only">(곧 열려요)</span>
                </span>
              ) : (
                <NavLink
                  to={to}
                  end={'end' in t ? t.end : false}
                  className={({ isActive }) =>
                    cn(
                      'flex min-h-tap flex-1 flex-col items-center justify-center gap-0.5 font-semibold',
                      isActive ? 'text-primary-700' : 'text-ink-muted',
                    )
                  }
                >
                  <Icon />
                  <span className="text-base leading-tight whitespace-pre-line text-center">
                    {label}
                  </span>
                </NavLink>
              )}
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
