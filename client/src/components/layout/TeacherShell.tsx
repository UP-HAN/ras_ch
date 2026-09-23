import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { cn } from '@/lib/cn';
import { CloseIcon, MenuIcon } from './icons';

/**
 * 교사 셸 (PRD 6.2, 6.3): PC 우선 좌측 메뉴 240px. 1024px 미만은 상단 햄버거 드로어.
 * 관리자 전용 섹션은 자리만 두고 S1(역할 조회) 이후 역할에 따라 숨긴다.
 */
const TEACHER_MENU = [
  { to: '/teacher', label: '반 대시보드', end: true },
  { to: '/teacher/pending', label: '승인 대기함' },
  { to: '/teacher/students', label: '학생 관리' },
  { to: '/teacher/comments', label: '댓글 모아보기' },
  { to: '/teacher/reports', label: '신고함' },
  { to: '/teacher/stats', label: '통계' },
];

const ADMIN_MENU = [
  { to: '/teacher/admin/school', label: '학교 설정' },
  { to: '/teacher/admin/point-rules', label: '포인트 규칙' },
  { to: '/teacher/admin/settlements', label: '월간 결산' },
  { to: '/teacher/admin/content', label: '공지·문구' },
];

function MenuList({ items, onNavigate }: { items: typeof TEACHER_MENU; onNavigate?: () => void }) {
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
          </NavLink>
        </li>
      ))}
    </ul>
  );
}

export function TeacherShell() {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  // 드로어에서 메뉴를 고르면 닫는다(onNavigate). PC 사이드바에서는 열림 상태가 없다
  const nav = (
    <nav aria-label="교사 메뉴" className="flex h-full flex-col gap-6 p-4">
      <div className="text-xl font-extrabold text-accent-700">
        <span aria-hidden="true">🏮</span> 초롱 RAS 포인트
        <div className="text-base font-medium text-ink-muted">교사 화면</div>
      </div>
      <MenuList items={TEACHER_MENU} onNavigate={close} />
      <div>
        <p className="mb-1 px-3 text-base font-bold text-ink-muted">관리자</p>
        <MenuList items={ADMIN_MENU} onNavigate={close} />
      </div>
    </nav>
  );

  return (
    <div className="min-h-dvh bg-paper lg:flex">
      {/* PC: 고정 사이드바 */}
      <aside className="hidden w-sidebar shrink-0 border-r border-line bg-surface lg:block">
        {nav}
      </aside>

      {/* 모바일·태블릿: 상단 바 + 드로어 */}
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
