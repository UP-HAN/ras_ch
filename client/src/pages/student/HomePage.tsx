import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { meApi } from '@/api/me';
import { Badge, Button, Card, EmptyState, Spinner } from '@/components/ui';

const TIER_LABEL: Record<string, string> = {
  seed: '씨앗',
  sprout: '새싹',
  flower: '꽃',
  fruit: '열매',
  star: '초롱별',
};

const REPORT_CARD: Record<
  string,
  { text: string; button: string | null; tone: 'default' | 'primary' }
> = {
  none: { text: '이번 주 리포트를 아직 안 올렸어요.', button: '리포트 올리기', tone: 'primary' },
  draft: { text: '쓰다 만 리포트가 있어요.', button: '이어서 쓰기', tone: 'primary' },
  pending: { text: '선생님이 확인하고 있어요. 조금만 기다려요!', button: null, tone: 'default' },
  reviewed: { text: '선생님이 확인하고 있어요. 조금만 기다려요!', button: null, tone: 'default' },
  flagged: { text: '선생님이 확인하고 있어요. 조금만 기다려요!', button: null, tone: 'default' },
  approved: { text: '이번 주 리포트가 게시됐어요. 잘했어요!', button: null, tone: 'default' },
  rejected: { text: '리포트를 고쳐서 다시 올려 주세요.', button: '다시 쓰기', tone: 'primary' },
  hidden: { text: '이 리포트는 선생님이 숨겼어요.', button: null, tone: 'default' },
};

/** 학생 홈 (6.1, CMN-05): 내 상태 → 리포트 카드 → 알림 → 우리 반 최근 글 */
export function HomePage() {
  const q = useQuery({ queryKey: ['me', 'home'], queryFn: meApi.home });

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

  const { me, weekPoints, report, notifications } = q.data;
  const card = REPORT_CARD[report.status] ?? REPORT_CARD.none!;

  return (
    <div className="space-y-4">
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
          </div>
        </div>
      </Card>

      <Card title="이번 주 리포트" tone={card.tone}>
        <p className="mb-3 text-base">{card.text}</p>
        {card.button && (
          <Button block size="lg" onClick={() => undefined}>
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
            {notifications.map((n) => (
              <li key={n.id} className="rounded-md bg-primary-50 px-3 py-2 text-base">
                {String((n.payload as { message?: string }).message ?? n.type)}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="우리 반 최근 글">
        <EmptyState title="아직 글이 없어요" description="첫 번째 리포트를 올려 볼까요?" />
      </Card>

      <p className="text-center text-base text-ink-muted">
        <Link to="/me" className="inline-flex min-h-tap items-center underline">
          내 정보
        </Link>
      </p>
    </div>
  );
}
