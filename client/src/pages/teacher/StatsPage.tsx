import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { statsApi } from '@/api/stats';
import { teacherApi } from '@/api/teacher';
import { PageHeader } from '@/components/layout/PageHeader';
import { BarChart } from '@/components/ui/BarChart';
import { Button, Card, Spinner } from '@/components/ui';
import { useMe } from '@/hooks/useMe';

const wkShort = (wk: string) => `W${Number(wk.slice(6))}`;

function SchoolStats() {
  const q = useQuery({ queryKey: ['admin', 'stats'], queryFn: statsApi.school });
  if (q.isLoading) return <Spinner className="text-accent-600" />;
  if (!q.data) return null;
  const d = q.data;
  return (
    <div className="space-y-4">
      <Card title={`학년별 참여 (이번 주 ${d.weekKey} · 이번 달 ${d.monthKey})`}>
        <table className="w-full text-left text-base">
          <thead>
            <tr className="border-b border-line text-ink-muted">
              <th className="py-2 pr-3">학년</th>
              <th className="py-2 pr-3">학생</th>
              <th className="py-2 pr-3">이번 주 제출률</th>
              <th className="py-2">이번 달 참여율</th>
            </tr>
          </thead>
          <tbody>
            {d.grades.map((g) => (
              <tr key={g.grade} className="border-b border-line/60">
                <td className="py-2 pr-3 font-semibold">{g.grade}학년</td>
                <td className="py-2 pr-3">{g.students}명</td>
                <td className="py-2 pr-3">{g.weekSubmissionRate}%</td>
                <td className="py-2">{g.monthParticipationRate}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <Card title="반별 참여·동의율·이번 달 평균 포인트">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-base">
            <thead>
              <tr className="border-b border-line text-ink-muted">
                <th className="py-2 pr-3">반</th>
                <th className="py-2 pr-3">학생</th>
                <th className="py-2 pr-3">동의율</th>
                <th className="py-2 pr-3">이번 주 제출률</th>
                <th className="py-2 pr-3">이번 달 참여율</th>
                <th className="py-2">평균 포인트</th>
              </tr>
            </thead>
            <tbody>
              {d.classes.map((c) => (
                <tr
                  key={c.classId}
                  className="border-b border-line/60"
                  data-testid={`stats-class-${c.classId}`}
                >
                  <td className="py-2 pr-3 font-semibold">{c.className}</td>
                  <td className="py-2 pr-3">{c.students}명</td>
                  <td className="py-2 pr-3">{c.consentRate}%</td>
                  <td className="py-2 pr-3">{c.weekSubmissionRate}%</td>
                  <td className="py-2 pr-3">{c.monthParticipationRate}%</td>
                  <td className="py-2">{c.avgMonthPoints}P</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="주차별 평균 사용시간 (승인 리포트, 분)">
          <BarChart
            unit="분"
            color="bg-accent-500"
            data={d.usageTrend.map((u) => ({
              label: u.weekKey,
              sub: wkShort(u.weekKey),
              value: u.avgMinutes,
            }))}
          />
        </Card>
        <Card title="주차별 활동량 (게시글)">
          <BarChart
            unit=""
            data={d.activityTrend.map((a) => ({
              label: a.weekKey,
              sub: wkShort(a.weekKey),
              value: a.posts,
            }))}
          />
        </Card>
        <Card title="주차별 댓글 수">
          <BarChart
            unit=""
            color="bg-info-600"
            data={d.activityTrend.map((a) => ({
              label: a.weekKey,
              sub: wkShort(a.weekKey),
              value: a.comments,
            }))}
          />
        </Card>
        <Card title="주차별 좋아요 수">
          <BarChart
            unit=""
            color="bg-success-600"
            data={d.activityTrend.map((a) => ({
              label: a.weekKey,
              sub: wkShort(a.weekKey),
              value: a.likes,
            }))}
          />
        </Card>
      </div>
    </div>
  );
}

/** 통계 (TCH-05 반 통계 CSV, ADM-05 전교 통계) */
export function StatsPage() {
  const { me } = useMe();
  const classes = useQuery({ queryKey: ['teacher', 'classes'], queryFn: teacherApi.classes });
  const [classId, setClassId] = useState<number | null>(null);
  const selected = classId ?? classes.data?.[0]?.id ?? null;
  const dash = useQuery({
    queryKey: ['teacher', 'dashboard', selected],
    queryFn: () => statsApi.classDashboard(selected as number),
    enabled: selected !== null,
  });
  return (
    <>
      <PageHeader
        title="통계"
        description="반 통계는 CSV로 내려받을 수 있어요. 관리자는 전교 통계도 볼 수 있어요."
      />
      <Card title="반 통계 CSV" className="mb-4">
        <div className="flex flex-wrap items-center gap-2">
          {classes.data?.map((c) => (
            <Button
              key={c.id}
              variant={c.id === selected ? 'primary' : 'secondary'}
              onClick={() => setClassId(c.id)}
            >
              {c.name}
            </Button>
          ))}
          {selected !== null && (
            <a
              href={statsApi.classCsvUrl(selected)}
              download
              className="ml-auto inline-flex min-h-tap items-center rounded-md bg-accent-600 px-4 text-base font-semibold text-white hover:bg-accent-700"
            >
              CSV 내려받기
            </a>
          )}
        </div>
        {dash.data && (
          <p className="mt-3 text-base text-ink-muted">
            {dash.data.className}: 이번 주 제출률 {dash.data.submissionRate}% · 평균{' '}
            {dash.data.avgWeekPoints}P · 미참여 {dash.data.nonParticipants.length}명
          </p>
        )}
      </Card>
      {me?.role === 'admin' && <SchoolStats />}
    </>
  );
}
