import { PageHeader } from '@/components/layout/PageHeader';
import { Card, EmptyState } from '@/components/ui';

/** 반 대시보드 골격 (TCH-01). 지표 연결은 S5 5-5 */
export function DashboardPage() {
  const stats = [
    ['이번 주 제출률', '—'],
    ['승인 대기', '—'],
    ['반 평균 포인트', '—'],
    ['미참여 학생', '—'],
  ];
  return (
    <>
      <PageHeader title="반 대시보드" description="우리 반의 이번 주 상황을 한눈에 봅니다." />
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map(([k, v]) => (
          <Card key={k}>
            <p className="text-base text-ink-muted">{k}</p>
            <p className="text-3xl font-extrabold text-accent-700">{v}</p>
          </Card>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="이번 주 상위 5명">
          <EmptyState icon="📊" title="아직 데이터가 없어요" />
        </Card>
        <Card title="승인 대기">
          <EmptyState icon="🗂️" title="대기 중인 글이 없어요" />
        </Card>
      </div>
    </>
  );
}
