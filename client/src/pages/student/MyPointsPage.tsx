import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { pointsApi, type PointsRange } from '@/api/points';
import { PageHeader } from '@/components/layout/PageHeader';
import { Badge, Button, Card, EmptyState, Spinner } from '@/components/ui';

const RANGES: Array<{ key: PointsRange; label: string }> = [
  { key: 'week', label: '이번 주' },
  { key: 'month', label: '이번 달' },
  { key: 'all', label: '전체' },
];

/** 내 포인트 (PT-06): 주/월/누적 합계 + 내역. 회수 행은 빨간색으로 표시 */
export function MyPointsPage() {
  const [range, setRange] = useState<PointsRange>('week');
  const q = useQuery({ queryKey: ['me', 'points', range], queryFn: () => pointsApi.mine(range) });

  return (
    <>
      <PageHeader title="내 포인트" description="언제 무엇으로 포인트를 받았는지 볼 수 있어요." />
      {q.isLoading && (
        <div className="flex justify-center py-10">
          <Spinner size="lg" className="text-primary-600" />
        </div>
      )}
      {q.data && (
        <div className="space-y-4">
          <Card tone="primary">
            <dl className="grid grid-cols-3 text-center">
              {[
                ['이번 주', q.data.week],
                ['이번 달', q.data.month],
                ['누적', q.data.all],
              ].map(([k, v]) => (
                <div key={String(k)}>
                  <dt className="text-base text-ink-muted">{k}</dt>
                  <dd className="text-2xl font-extrabold text-primary-700">{v}P</dd>
                </div>
              ))}
            </dl>
          </Card>

          <div className="flex gap-2">
            {RANGES.map((r) => (
              <Button
                key={r.key}
                variant={range === r.key ? 'primary' : 'secondary'}
                onClick={() => setRange(r.key)}
              >
                {r.label}
              </Button>
            ))}
          </div>

          {q.data.items.length === 0 ? (
            <EmptyState
              icon="🪙"
              title="아직 받은 포인트가 없어요"
              description="리포트를 올리고 승인되면 포인트가 쌓여요."
            />
          ) : (
            <Card>
              <ul className="divide-y divide-line">
                {q.data.items.map((it) => (
                  <li key={it.id} className="flex items-start gap-3 py-3">
                    <span
                      className={`w-16 shrink-0 text-lg font-extrabold ${it.amount < 0 ? 'text-danger-600' : 'text-primary-700'}`}
                    >
                      {it.amount > 0 ? '+' : ''}
                      {it.amount}P
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-base font-semibold">
                        {it.ruleName}
                        {it.isReversal && (
                          <Badge tone="danger" className="ml-2">
                            회수
                          </Badge>
                        )}
                      </p>
                      {it.note && !it.isReversal && (
                        <p className="text-base text-ink-muted">
                          {it.grantedByName ? `${it.grantedByName} 선생님: ` : ''}
                          {it.note}
                        </p>
                      )}
                      <p className="text-base text-ink-muted">
                        {new Date(it.createdAt).toLocaleString('ko-KR', {
                          month: 'numeric',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      )}
    </>
  );
}
