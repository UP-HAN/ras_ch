import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { meApi } from '@/api/me';
import { postsApi } from '@/api/posts';
import { reactionsApi } from '@/api/reactions';
import { reviewApi } from '@/api/review';
import { TopicCard } from '@/components/news/TopicCard';
import { ReportCard } from '@/components/post/ReportCard';
import { Badge, Button, Card, EmptyState, Spinner } from '@/components/ui';

const TIER_LABEL: Record<string, string> = {
  seed: '씨앗',
  sprout: '새싹',
  flower: '꽃',
  fruit: '열매',
  star: '초롱별',
};

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

  if (q.isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner size="lg" className="text-primary-600" />
      </div>
    );
  }
  if (!q.data) {
    return (
      <EmptyState
        icon="😵"
        title="불러오지 못했어요"
        description="잠시 후 다시 열어 주세요."
        action={<Button onClick={() => q.refetch()}>다시 시도</Button>}
      />
    );
  }

  const { me, weekPoints, report, notifications, notices, debate } = q.data;
  const card = REPORT_CARD[report.status] ?? (REPORT_CARD.none as CardSpec);
  const openNotification = async (id: number, link?: string) => {
    await meApi.readNotification(id).catch(() => undefined);
    await qc.invalidateQueries({ queryKey: ['me', 'home'] });
    if (link) navigate(link);
  };

  return (
    <div className="space-y-4">
      {notices.map((n) => (
        <section
          key={n.id}
          data-testid="notice-banner"
          className="rounded-lg border border-accent-100 bg-accent-50 px-4 py-3"
        >
          <p className="text-base font-bold text-accent-700">📢 {n.title}</p>
          <p className="mt-1 whitespace-pre-wrap text-base">{n.body}</p>
        </section>
      ))}
      {debate && (
        <section data-testid="debate-card">
          <p className="mb-1 text-base font-bold text-accent-700">💬 오늘의 토론</p>
          <TopicCard t={debate} home />
        </section>
      )}
      <Card tone="primary">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-base text-ink-muted">안녕하세요</p>
            <p className="text-2xl font-extrabold">
              {me.className ? `${me.className} ` : ''}
              {me.displayName} <Badge tone="primary">{TIER_LABEL[me.tier] ?? me.tier}</Badge>
              {me.isReporter && (
                <Badge tone="info" className="ml-1">
                  기자단
                </Badge>
              )}
            </p>
          </div>
          <div className="text-right">
            <p className="text-base text-ink-muted">이번 주 포인트</p>
            <p className="text-3xl font-extrabold text-primary-700">{weekPoints}P</p>
            {attendance.data && (
              <p className="text-base text-ink-muted">
                {attendance.data.streak >= 2
                  ? `🔥 ${attendance.data.streak}일 연속 출석`
                  : '✅ 오늘 출석'}
              </p>
            )}
          </div>
        </div>
      </Card>

      {review.data?.hasAssignment && (
        <Card title="리포트 검토" tone="accent" data-testid="review-card">
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

      <Card title="이번 주 리포트" tone={card.tone}>
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
                    className={`flex min-h-tap w-full items-center rounded-md px-3 py-2 text-left text-base ${n.readAt ? 'bg-paper text-ink-muted' : 'bg-primary-50 font-semibold'}`}
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
          <EmptyState title="아직 글이 없어요" description="첫 번째 리포트를 올려 볼까요?" />
        )}
      </Card>
    </div>
  );
}
