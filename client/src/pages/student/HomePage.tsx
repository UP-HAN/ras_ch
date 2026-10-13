import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Tier } from '@server-types/db';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { meApi } from '@/api/me';
import { postsApi } from '@/api/posts';
import { reactionsApi } from '@/api/reactions';
import { reviewApi } from '@/api/review';
import { MissionGauge } from '@/components/common/MissionGauge';
import { TierBadge } from '@/components/common/TierBadge';
import { CouncilCard } from '@/components/council/CouncilCard';
import { TopicCard } from '@/components/news/TopicCard';
import { ReportCard } from '@/components/post/ReportCard';
import { AttendanceStamp } from '@/components/fun/AttendanceStamp';
import { Celebration } from '@/components/fun/Celebration';
import { Mascot } from '@/components/fun/Mascot';
import { PageLoading } from '@/components/fun/PageLoading';
import { TierUpModal } from '@/components/fun/TierUpModal';
import { Badge, Button, Card, EmptyState } from '@/components/ui';
import { checkCelebrations, checkStamp, safeStorage, seoulToday } from '@/lib/celebrate';
import { useCountUp } from '@/lib/motion';

type CardSpec = {
  text: string;
  button: string | null;
  tone: 'default' | 'primary';
  to: (id: number | null) => string;
};
const REPORT_CARD: Record<string, CardSpec> = {
  none: {
    text: '이번 주 리포트를 아직 안 올렸어요.',
    button: '리포트 올리기',
    tone: 'primary',
    to: () => '/write/report',
  },
  draft: {
    text: '쓰다 만 리포트가 있어요.',
    button: '이어서 쓰기',
    tone: 'primary',
    to: (id) => `/posts/${id}/edit`,
  },
  pending: {
    text: '선생님이 확인하고 있어요. 조금만 기다려요!',
    button: '내 리포트 보기',
    tone: 'default',
    to: (id) => `/posts/${id}`,
  },
  reviewed: {
    text: '선생님이 확인하고 있어요. 조금만 기다려요!',
    button: '내 리포트 보기',
    tone: 'default',
    to: (id) => `/posts/${id}`,
  },
  flagged: {
    text: '선생님이 확인하고 있어요. 조금만 기다려요!',
    button: '내 리포트 보기',
    tone: 'default',
    to: (id) => `/posts/${id}`,
  },
  approved: {
    text: '이번 주 리포트가 게시됐어요. 잘했어요!',
    button: '내 리포트 보기',
    tone: 'default',
    to: (id) => `/posts/${id}`,
  },
  rejected: {
    text: '선생님 말씀을 보고 고쳐서 다시 올려 주세요.',
    button: '고쳐서 다시 보내기',
    tone: 'primary',
    to: (id) => `/posts/${id}/edit`,
  },
  hidden: {
    text: '이 리포트는 선생님이 숨겼어요.',
    button: '내 리포트 보기',
    tone: 'default',
    to: (id) => `/posts/${id}`,
  },
};

type CelebrationItem = { kind: 'tier'; tier: Tier } | { kind: 'points'; points: number };

/** 리포트를 올릴 차례(none·draft·rejected)면 연필 든 초롱이를 보여 준다 (01-spec 6.6) */
const WRITE_TURN = new Set(['none', 'draft', 'rejected']);

/** 학생 홈 (6.1, CMN-05): 내 상태 → 리포트 카드 → 알림 → 우리 반 최근 글 */
export function HomePage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['me', 'home'], queryFn: meApi.home });
  const attendance = useQuery({ queryKey: ['me', 'attendance'], queryFn: reactionsApi.attendance });
  const recent = useQuery({
    queryKey: ['posts', 'list', 'class', 'home'],
    queryFn: () => postsApi.list('class'),
  });
  const canReview = q.data?.me.isCouncil || q.data?.me.role === 'council_teacher';
  const review = useQuery({
    queryKey: ['review', 'summary'],
    queryFn: reviewApi.summary,
    enabled: canReview === true,
  });

  // 01-spec 6.5: 축하 판단(등급 → 포인트 순서, 최대 2개)과 출석 도장은 localStorage 로만
  const [celebrations, setCelebrations] = useState<CelebrationItem[]>([]);
  const home = q.data;
  const userId = home?.me.id;
  const weekKey = home?.weekKey;
  const weekPointsNow = home?.weekPoints;
  const tierNow = home?.me.tier;
  useEffect(() => {
    if (userId === undefined || weekKey === undefined || weekPointsNow === undefined || !tierNow)
      return;
    const r = checkCelebrations(safeStorage(), {
      userId,
      weekKey,
      weekPoints: weekPointsNow,
      tier: tierNow,
    });
    const next: CelebrationItem[] = [];
    if (r.tierUp) next.push({ kind: 'tier', tier: r.tierUp });
    if (r.pointsGain) next.push({ kind: 'points', points: r.pointsGain });
    // 바깥 저장소(localStorage)와 비교한 결과를 화면에 반영한다. 홈 값이 바뀔 때만 실행된다
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (next.length > 0) setCelebrations(next);
  }, [userId, weekKey, weekPointsNow, tierNow]);

  const stampChecked = useRef(false);
  const [stampAnimate, setStampAnimate] = useState(false);
  const hasAttendance = !!attendance.data;
  useEffect(() => {
    if (!hasAttendance || userId === undefined || stampChecked.current) return;
    stampChecked.current = true;
    setStampAnimate(checkStamp(safeStorage(), userId, seoulToday()));
  }, [hasAttendance, userId]);

  const weekPointsShown = useCountUp(weekPointsNow ?? 0, 800);
  const closeCelebration = () => setCelebrations((list) => list.slice(1));

  if (q.isLoading) {
    return <PageLoading />;
  }
  if (!q.data) {
    return (
      <EmptyState
        icon="😵"
        illustration="oops"
        title="불러오지 못했어요"
        description="잠시 후 다시 열어 주세요."
        action={<Button onClick={() => q.refetch()}>다시 시도</Button>}
      />
    );
  }

  const {
    me,
    weekPoints,
    report,
    notifications,
    notices,
    debate,
    councilPinned,
    missions,
    classMission,
  } = q.data;
  const missionsDone = missions.filter((m) => m.done).length;
  const card = REPORT_CARD[report.status] ?? (REPORT_CARD.none as CardSpec);
  const allMissionsDone = missionsDone === missions.length && missions.length > 0;
  const current = celebrations[0];
  const openNotification = async (id: number, link?: string) => {
    await meApi.readNotification(id).catch(() => undefined);
    await qc.invalidateQueries({ queryKey: ['me', 'home'] });
    if (link) navigate(link);
  };

  return (
    <div className="anim-stagger space-y-4">
      {current?.kind === 'tier' && <TierUpModal tier={current.tier} onClose={closeCelebration} />}
      {current?.kind === 'points' && (
        <Celebration points={current.points} onClose={closeCelebration} />
      )}
      {notices.map((n) => (
        <section
          key={n.id}
          data-testid="notice-banner"
          className="anim-pop-in rounded-xl border-2 border-mint-400/40 bg-mint-100 px-4 py-3"
        >
          <p className="text-base font-bold text-mint-700">📢 {n.title}</p>
          <p className="mt-1 whitespace-pre-wrap text-base">{n.body}</p>
        </section>
      ))}
      {councilPinned.length > 0 && (
        <section
          data-testid="council-pinned"
          className="anim-pop-in space-y-2 rounded-xl border-2 border-primary-200 bg-primary-50 p-3"
        >
          <p className="text-base font-bold text-primary-700">🏫 학생자치회</p>
          {councilPinned.map((p) => (
            <CouncilCard key={p.id} post={p} banner />
          ))}
        </section>
      )}
      {debate && (
        <section data-testid="debate-card">
          <p className="mb-1 text-base font-bold text-accent-700">💬 오늘의 토론</p>
          <TopicCard t={debate} home />
        </section>
      )}
      <Card tone="hero">
        {/* 360px 에서 이름·배지가 세로로 쪼개지지 않게: 위(초롱이+이름+배지) / 아래(출석·포인트) 두 줄 (2026-10-13) */}
        <div className="flex items-start gap-3">
          <Mascot name="hello" size={64} sticker className="shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-base text-ink-muted">안녕하세요</p>
            <p className="text-2xl font-extrabold break-keep">
              {me.className ? `${me.className} ` : ''}
              {me.displayName}
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-1">
              <TierBadge tier={me.tier} />
              {me.title && (
                <Badge tone="primary" data-testid="my-title">
                  {me.title.emoji} {me.title.label}
                </Badge>
              )}
              {me.isReporter && <Badge tone="info">기자단</Badge>}
            </div>
          </div>
        </div>
        <div className="mt-3 flex items-end justify-between gap-2 rounded-lg bg-surface/70 px-3 py-2">
          {attendance.data ? (
            <div className="flex items-center gap-1">
              <AttendanceStamp animate={stampAnimate} />
              <p className="text-base text-ink">
                {attendance.data.streak >= 2 ? (
                  <>
                    <span className="anim-flame" aria-hidden="true">
                      🔥
                    </span>{' '}
                    {attendance.data.streak}일 연속 출석
                  </>
                ) : (
                  '✅ 오늘 출석'
                )}
              </p>
            </div>
          ) : (
            <span />
          )}
          <div className="text-right">
            <p className="text-base text-ink-muted">이번 주 포인트</p>
            <p
              className="font-display text-3xl font-extrabold text-primary-700"
              aria-label={`${weekPoints}P`}
            >
              {weekPointsShown}P
            </p>
          </div>
        </div>
      </Card>

      <Card
        title={
          allMissionsDone ? (
            <>
              <span className="anim-sparkle inline-block rounded-md" aria-hidden="true">
                🎉
              </span>{' '}
              이번 주 미션 완료!
            </>
          ) : (
            '이번 주 미션'
          )
        }
        action={allMissionsDone ? <Mascot name="cheer" size={56} sticker /> : undefined}
        tone="mint"
        data-testid="missions-card"
      >
        <MissionGauge
          value={missionsDone}
          max={missions.length}
          label="이번 주 미션 진행"
          className="mb-3"
        />
        <ul className="space-y-2">
          {missions.map((m) => (
            <li
              key={m.code}
              className="flex items-center gap-2 text-base"
              data-testid={`mission-${m.code}`}
            >
              <span aria-hidden="true">{m.done ? '✅' : m.emoji}</span>
              <span className={m.done ? 'text-ink-muted line-through' : 'font-semibold'}>
                {m.label}
              </span>
              <span className="ml-auto text-ink-muted">
                {m.current}/{m.target}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-base text-ink-muted">
          {missionsDone === missions.length && missions.length > 0
            ? '이번 주 미션을 모두 해냈어요. 대단해요!'
            : `${missions.length - missionsDone}개 남았어요. 미션은 포인트와 상관없이 재미로 해요.`}
        </p>
      </Card>

      {classMission && (
        <Card
          title={
            classMission.achieved
              ? '🎉 우리 반 미션 달성!'
              : `우리 반 미션 (${classMission.className})`
          }
          tone="primary"
          data-testid="class-mission-card"
        >
          <p className="mb-2 text-base">
            이번 주 리포트 제출률 <strong>{classMission.ratePct}%</strong> · 목표{' '}
            {classMission.targetPct}%
            <span className="ml-1 text-ink-muted">
              ({classMission.submitted}/{classMission.students}명)
            </span>
          </p>
          <MissionGauge
            value={classMission.ratePct}
            max={100}
            label="우리 반 리포트 제출률"
            tone={classMission.achieved ? 'success' : 'accent'}
          />
        </Card>
      )}

      {review.data?.hasAssignment && (
        <Card title="리포트 검토" tone="mint" data-testid="review-card">
          <p className="mb-3 text-base">
            {review.data.pending > 0
              ? `검토를 기다리는 글이 ${review.data.pending}건 있어요.`
              : '지금은 검토할 글이 없어요.'}
          </p>
          <Button block size="lg" variant="secondary" onClick={() => navigate('/review')}>
            검토하러 가기
          </Button>
        </Card>
      )}

      <Card
        title="이번 주 리포트"
        tone="primary"
        action={
          WRITE_TURN.has(report.status) ? <Mascot name="write" size={72} sticker /> : undefined
        }
      >
        <p className="mb-3 text-base">{card.text}</p>
        {card.button && (
          <Button
            block
            size="lg"
            variant={card.tone === 'primary' ? 'primary' : 'secondary'}
            onClick={() => navigate(card.to(report.postId))}
          >
            {card.button}
          </Button>
        )}
      </Card>

      <Card title="알림">
        {notifications.length === 0 ? (
          <EmptyState
            icon="🔔"
            illustration="sleep"
            title="새 알림이 없어요"
            description="선생님이 확인하면 여기에 알려 드려요."
          />
        ) : (
          <ul className="space-y-2">
            {notifications.map((n) => {
              const payload = n.payload as { message?: string; link?: string };
              return (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => openNotification(n.id, payload.link)}
                    className={`flex min-h-tap w-full items-center rounded-md px-3 py-2 text-left text-base ${n.readAt ? 'bg-surface/60 text-ink-muted' : 'bg-surface font-semibold shadow-card'}`}
                  >
                    {n.readAt ? '' : '🔔 '}
                    {String(payload.message ?? n.type)}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card
        title="우리 반 최근 글"
        action={
          <Link
            to="/posts"
            className="inline-flex min-h-tap items-center text-base font-semibold text-primary-700 underline"
          >
            더 보기
          </Link>
        }
      >
        {recent.data && recent.data.items.length > 0 ? (
          <div className="space-y-3">
            {recent.data.items.slice(0, 3).map((p) => (
              <ReportCard key={p.id} post={p} />
            ))}
          </div>
        ) : (
          <EmptyState
            illustration="sleep"
            title="아직 글이 없어요"
            description="첫 번째 리포트를 올려 볼까요?"
          />
        )}
      </Card>
    </div>
  );
}
