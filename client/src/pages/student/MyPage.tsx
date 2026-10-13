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
import { Mascot } from '@/components/fun/Mascot';
import { Badge, Button, Card } from '@/components/ui';
import { useCountUp } from '@/lib/motion';
import { useMe, useMeCache } from '@/hooks/useMe';

/** 포인트 큰 숫자: 0 에서 올라간다 (6.4 #2) */
function CountUpPoints({ value }: { value: number }) {
  const shown = useCountUp(value, 800);
  return (
    <dd className="font-display text-2xl font-extrabold text-primary-700" aria-label={`${value}P`}>
      {shown}P
    </dd>
  );
}

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
      <div className="anim-stagger space-y-4">
        <Card>
          {/* 이름(한 덩어리) / 배지 / 아이디 를 줄 단위로 나누고, 오른쪽 빈 칸에 그림 그리는 초롱이 (줄바꿈 원칙·RAS 그림) */}
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-xl font-extrabold">
                <span className="name-nowrap">
                  {me?.className ? `${me.className} ` : ''}
                  {me?.displayName}
                </span>
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-1">
                {me && <TierBadge tier={me.tier} />}
                {me?.title && (
                  <Badge tone="primary">
                    {me.title.emoji} {me.title.label}
                  </Badge>
                )}
              </div>
              <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-base text-ink-muted">
                <span className="whitespace-nowrap">아이디 {me?.loginId}</span>
                {me?.isCouncil && <Badge tone="info">자치회 임원</Badge>}
              </p>
            </div>
            <Mascot name="rasArt" size={80} className="shrink-0" />
          </div>
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
            {(
              [
                ['이번 주', points.data?.week ?? 0],
                ['이번 달', points.data?.month ?? 0],
                ['누적', points.data?.all ?? 0],
              ] as const
            ).map(([k, v]) => (
              <div key={k}>
                <dt className="text-base text-ink-muted">{k}</dt>
                <CountUpPoints value={v} />
              </div>
            ))}
          </dl>
        </Card>
        {ach.data && (
          <Card title="내 등급" data-testid="tier-card" action={<Mascot name="shine" size={64} />}>
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
              <p className="mt-1 text-base">
                <span className="anim-flame" aria-hidden="true">
                  🔥
                </span>{' '}
                {ach.data.attendanceStreak}일 연속 출석 중
              </p>
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
                          : 'border-primary-200 bg-primary-50'
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
            {/* BUG-01: 학생 화면에서는 "불편한 점 알리기"로 부른다 */}
            <Button block variant="secondary" onClick={() => navigate('/me/bug-report')}>
              불편한 점 알리기
            </Button>
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
