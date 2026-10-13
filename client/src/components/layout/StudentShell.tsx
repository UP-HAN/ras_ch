import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { reviewApi } from '@/api/review';
import { useMe, useMeCache } from '@/hooks/useMe';
import { LanternLogo } from '@/components/fun/LanternLogo';
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
  const backToTeacher = async () => {
    await reviewApi.switchRole('teacher');
    cache.clear();
    navigate('/teacher', { replace: true });
  };
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[480px] flex-col">
      <header className="sticky top-0 z-10 flex h-14 items-center justify-between bg-surface/95 px-4 backdrop-blur">
        <a href="/" className="flex min-h-tap items-center gap-2">
          <LanternLogo swing />
          <span className="font-display text-xl font-extrabold text-primary-700">
            초롱 RAS 포인트
          </span>
        </a>
        {canReview && (
          <NavLink
            to="/review"
            className={({ isActive }) =>
              cn(
                'anim-press inline-flex min-h-tap items-center rounded-full px-4 text-base font-bold',
                isActive ? 'bg-primary-700 text-white' : 'bg-primary-100 text-primary-800',
              )
            }
          >
            🔍 검토
          </NavLink>
        )}
        {/* 헤더 아래 4px 무지개 띠 (01-spec 6.3) */}
        <div aria-hidden="true" className="bg-rainbow absolute inset-x-0 -bottom-1 h-1" />
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
        className="fixed inset-x-0 bottom-0 z-10 rounded-t-[20px] bg-surface shadow-[0_-4px_16px_rgb(46_125_50/0.12)] safe-bottom"
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
                      'flex min-h-tap flex-1 flex-col items-center justify-center gap-0.5',
                      isActive ? 'font-bold text-primary-700' : 'font-semibold text-ink-muted',
                    )
                  }
                >
                  {({ isActive }) => (
                    <>
                      {/* 활성 탭: 아이콘 뒤 알약 + 통통 1회 (6.4 #10) */}
                      <span
                        className={cn(
                          'flex h-8 w-14 items-center justify-center rounded-full',
                          isActive && 'anim-tab-bounce bg-primary-100',
                        )}
                      >
                        <Icon />
                      </span>
                      <span className="text-base leading-tight whitespace-pre-line text-center">
                        {label}
                      </span>
                    </>
                  )}
                </NavLink>
              )}
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
