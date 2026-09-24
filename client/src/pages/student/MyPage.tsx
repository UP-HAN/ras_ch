import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { gamifyApi } from '@/api/gamify';
import { errorMessage } from '@/api/client';
import { MissionGauge } from '@/components/common/MissionGauge';
import { TierBadge } from '@/components/common/TierBadge';
import { cn } from '@/lib/cn';
import { useNavigate } from 'react-router-dom';
import { pointsApi } from '@/api/points';
import { authApi } from '@/api/auth';
import { PageHeader } from '@/components/layout/PageHeader';
import { Badge, Button, Card } from '@/components/ui';
import { useMe, useMeCache } from '@/hooks/useMe';

/** 내 정보 (6.1) + 내 포인트 합계 (PT-06) */
export function MyPage() {
  const { me } = useMe();
  const cache = useMeCache();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const points = useQuery({
    queryKey: ['me', 'points', 'week'],
    queryFn: () => pointsApi.mine('week'),
  });
  const ach = useQuery({
    queryKey: ['me', 'achievements'],
    queryFn: gamifyApi.myAchievements,
    enabled: me?.role === 'student',
  });
  const [titleMsg, setTitleMsg] = useState<string | null>(null);
  const setTitle = useMutation({
    mutationFn: (code: string | null) => gamifyApi.setTitle(code),
    onSuccess: (r) => {
      setTitleMsg(
        r.titleCode ? '대표 칭호를 걸었어요. 내 글과 댓글 옆에 보여요.' : '대표 칭호를 내렸어요.',
      );
      void qc.invalidateQueries({ queryKey: ['me'] });
    },
    onError: (e) => setTitleMsg(errorMessage(e)),
  });

  const logout = async () => {
    await authApi.logout();
    cache.clear();
    navigate('/login', { replace: true });
  };

  return (
    <>
      <PageHeader title="내 정보" />
      <div className="space-y-4">
        <Card>
          <p className="text-xl font-extrabold">
            {me?.className ? `${me.className} ` : ''}
            {me?.displayName} {me && <TierBadge tier={me.tier} />}
            {me?.title && (
              <Badge tone="primary" className="ml-1">
                {me.title.emoji} {me.title.label}
              </Badge>
            )}
          </p>
          <p className="mt-1 text-base text-ink-muted">
            아이디 {me?.loginId} {me?.isCouncil && <Badge tone="info">자치회 임원</Badge>}
          </p>
        </Card>
        <Card
          title="내 포인트"
          action={
            <Button variant="secondary" onClick={() => navigate('/me/points')}>
              내역 보기
            </Button>
          }
        >
          <dl className="grid grid-cols-3 text-center">
            {[
              ['이번 주', `${points.data?.week ?? 0}P`],
              ['이번 달', `${points.data?.month ?? 0}P`],
              ['누적', `${points.data?.all ?? 0}P`],
            ].map(([k, v]) => (
              <div key={k}>
                <dt className="text-base text-ink-muted">{k}</dt>
                <dd className="text-2xl font-extrabold text-primary-700">{v}</dd>
              </div>
            ))}
          </dl>
        </Card>
        {ach.data && (
          <Card title="내 등급" data-testid="tier-card">
            <p className="text-lg font-bold">
              {ach.data.tier.emoji} {ach.data.tier.label} 등급 ·{' '}
              <span className="text-primary-700">누적 {ach.data.tier.points}P</span>
            </p>
            {ach.data.tier.next ? (
              <>
                <MissionGauge
                  className="mt-2"
                  value={ach.data.tier.points - ach.data.tier.next.from}
                  max={ach.data.tier.next.to - ach.data.tier.next.from}
                  label="다음 등급까지"
                />
                <p className="mt-1 text-base text-ink-muted">
                  {ach.data.tier.next.emoji} {ach.data.tier.next.label} 등급까지{' '}
                  {ach.data.tier.next.needed}P 남았어요
                </p>
              </>
            ) : (
              <p className="mt-1 text-base text-ink-muted">가장 높은 등급이에요. 멋져요!</p>
            )}
            {ach.data.attendanceStreak >= 2 && (
              <p className="mt-1 text-base">🔥 {ach.data.attendanceStreak}일 연속 출석 중</p>
            )}
          </Card>
        )}
        {ach.data && (
          <Card title="내 칭호" data-testid="achievements-card">
            <p className="mb-3 text-base text-ink-muted">
              얻은 칭호를 누르면 대표 칭호로 걸 수 있어요. (
              {ach.data.achievements.filter((a) => a.earned).length}/{ach.data.achievements.length})
            </p>
            <ul className="grid grid-cols-3 gap-2">
              {ach.data.achievements.map((a) => (
                <li key={a.code}>
                  <button
                    type="button"
                    disabled={!a.earned || setTitle.isPending}
                    aria-pressed={a.isTitle}
                    data-testid={`ach-${a.code}`}
                    onClick={() => setTitle.mutate(a.isTitle ? null : a.code)}
                    className={cn(
                      'flex min-h-[88px] w-full flex-col items-center justify-center rounded-lg border-2 p-2 text-center',
                      a.earned
                        ? a.isTitle
                          ? 'border-primary-600 bg-primary-100'
                          : 'border-primary-200 bg-surface'
                        : 'border-line bg-paper opacity-60',
                    )}
                  >
                    <span className="text-2xl" aria-hidden="true">
                      {a.earned ? a.emoji : '🔒'}
                    </span>
                    <span className="text-base font-bold">{a.label}</span>
                    <span className="text-base text-ink-muted">
                      {a.earned
                        ? a.isTitle
                          ? '대표 칭호'
                          : a.hint
                        : a.progress
                          ? `${a.progress.current}/${a.progress.target}`
                          : a.hint}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            {titleMsg && <p className="mt-2 text-base text-ink-muted">{titleMsg}</p>}
          </Card>
        )}
        <Card title="계정">
          <div className="space-y-2">
            <Button block variant="secondary" onClick={() => navigate('/change-password')}>
              비밀번호 바꾸기
            </Button>
            <Button block variant="ghost" onClick={logout}>
              로그아웃
            </Button>
          </div>
        </Card>
      </div>
    </>
  );
}
