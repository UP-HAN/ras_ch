import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { statsApi } from '@/api/stats';
import { teacherApi } from '@/api/teacher';
import { PageHeader } from '@/components/layout/PageHeader';
import { Badge, Button, Card, EmptyState, Spinner } from '@/components/ui';

/** 반 대시보드 (TCH-01): 제출률·승인 대기·반 평균 포인트·상위 5명·미참여 학생 */
export function DashboardPage() {
  const classes = useQuery({ queryKey: ['teacher', 'classes'], queryFn: teacherApi.classes });
  const [classId, setClassId] = useState<number | null>(null);
  const selected = classId ?? classes.data?.[0]?.id ?? null;
  const q = useQuery({
    queryKey: ['teacher', 'dashboard', selected],
    queryFn: () => statsApi.classDashboard(selected as number),
    enabled: selected !== null,
  });
  const d = q.data;
  const stats: Array<[string, string, string?]> = d
    ? [
        ['이번 주 제출률', `${d.submissionRate}%`, `${d.submitted}/${d.studentCount}명`],
        [
          '승인 대기',
          `${d.pending.total}건`,
          d.pending.escalated ? `48시간 지남 ${d.pending.escalated}건` : undefined,
        ],
        ['반 평균 포인트', `${d.avgWeekPoints}P`, d.weekKey],
        [
          '학급 미션',
          d.classMission.achieved ? '달성 🎉' : `${d.classMission.ratePct}%`,
          `목표 제출률 ${d.classMission.targetPct}%`,
        ],
      ]
    : [];

  return (
    <>
      <PageHeader title="반 대시보드" description="우리 반의 이번 주 상황을 한눈에 봅니다." />
      <div className="mb-4 flex flex-wrap gap-2">
        {classes.data?.map((c) => (
          <Button
            key={c.id}
            variant={c.id === selected ? 'primary' : 'secondary'}
            onClick={() => setClassId(c.id)}
          >
            {c.name}
          </Button>
        ))}
        {classes.data?.length === 0 && (
          <p className="text-base text-ink-muted">담당 반이 없어요.</p>
        )}
      </div>
      {q.isLoading && <Spinner className="text-accent-600" />}
      {d && (
        <>
          <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-5">
            {stats.map(([k, v, sub]) => (
              <Card key={k}>
                <p className="text-base text-ink-muted">{k}</p>
                <p className="text-3xl font-extrabold text-accent-700">{v}</p>
                {sub && <p className="text-base text-ink-muted">{sub}</p>}
              </Card>
            ))}
          </div>
          <div className="mb-4">
            <div
              className="h-4 w-full overflow-hidden rounded-full bg-primary-100"
              role="progressbar"
              aria-valuenow={d.submissionRate}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="이번 주 제출률"
            >
              <div className="h-full bg-primary-500" style={{ width: `${d.submissionRate}%` }} />
            </div>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card title="이번 주 상위 5명">
              {d.top5.length === 0 ? (
                <EmptyState icon="📊" title="아직 포인트가 없어요" />
              ) : (
                <ol className="space-y-1">
                  {d.top5.map((s, i) => (
                    <li
                      key={s.userId}
                      className="flex min-h-tap items-center gap-3 rounded-md bg-paper px-3 text-base"
                    >
                      <span className="w-8 font-extrabold text-accent-700">{i + 1}위</span>
                      <span className="font-semibold">
                        {s.studentNo}번 {s.name}
                      </span>
                      <span className="ml-auto font-bold text-primary-700">{s.points}P</span>
                    </li>
                  ))}
                </ol>
              )}
            </Card>
            <Card
              title="승인 대기"
              action={
                <Link
                  to="/teacher/pending"
                  className="inline-flex min-h-tap items-center text-base font-semibold text-accent-700 underline"
                >
                  대기함 열기
                </Link>
              }
            >
              <div className="flex flex-wrap gap-2">
                <Badge tone="success">1차 통과 {d.pending.reviewed}</Badge>
                <Badge tone="warn">보류 요청 {d.pending.flagged}</Badge>
                <Badge tone="info">미검토 {d.pending.pending}</Badge>
                {d.pending.escalated > 0 && (
                  <Badge tone="danger">48시간 지남 {d.pending.escalated}</Badge>
                )}
              </div>
            </Card>
            <Card title="미참여 학생 (이번 주 리포트 없음)" className="lg:col-span-2">
              {d.nonParticipants.length === 0 ? (
                <p className="text-base text-success-600">모두 제출했어요! 🎉</p>
              ) : (
                <ul className="flex flex-wrap gap-2">
                  {d.nonParticipants.map((s) => (
                    <li
                      key={s.userId}
                      className="rounded-full border border-line px-3 py-1 text-base"
                    >
                      {s.studentNo}번 {s.name}
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </>
      )}
    </>
  );
}
