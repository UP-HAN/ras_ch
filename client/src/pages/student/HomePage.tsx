import { Badge, Button, Card, EmptyState } from '@/components/ui';

/**
 * 학생 홈 골격 (PRD 6.1, CMN-05 우선순위: 고정 공지 → 토론 → 내 상태 → 알림 → 추천 기사 → 우리 반 글).
 * 데이터 연결은 S1 1-6 부터. 지금은 카드 자리만.
 */
export function HomePage() {
  return (
    <div className="space-y-4">
      <Card tone="primary">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-base text-ink-muted">안녕하세요</p>
            <p className="text-2xl font-extrabold">
              5-1 김○롱 <Badge tone="primary">새싹</Badge>
            </p>
          </div>
          <div className="text-right">
            <p className="text-base text-ink-muted">이번 주 포인트</p>
            <p className="text-3xl font-extrabold text-primary-700">0P</p>
          </div>
        </div>
      </Card>

      <Card title="이번 주 리포트">
        <p className="mb-3 text-base">이번 주 리포트를 아직 안 올렸어요.</p>
        <Button block size="lg">
          리포트 올리기
        </Button>
      </Card>

      <Card title="알림">
        <EmptyState
          icon="🔔"
          title="새 알림이 없어요"
          description="선생님이 확인하면 여기에 알려 드려요."
        />
      </Card>

      <Card title="우리 반 최근 글">
        <EmptyState title="아직 글이 없어요" description="첫 번째 리포트를 올려 볼까요?" />
      </Card>
    </div>
  );
}
