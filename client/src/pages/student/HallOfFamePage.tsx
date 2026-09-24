import { useQuery } from '@tanstack/react-query';
import type { HallAward, HallClassRow, HallStudent } from '@server-types/api';
import { useState } from 'react';
import { hallApi } from '@/api/hallOfFame';
import { WeeklyGiftPanel } from '@/components/hall/WeeklyGiftPanel';
import { useMe } from '@/hooks/useMe';
import { PageHeader } from '@/components/layout/PageHeader';
import { Badge, Button, Card, EmptyState, Spinner } from '@/components/ui';
import { cn } from '@/lib/cn';

const TABS = ['주간 TOP', '월간', '학급', '역대'] as const;
type Tab = (typeof TABS)[number];

const weekLabel = (wk: string) => `${wk.slice(0, 4)}년 ${Number(wk.slice(6))}주차`;
const monthLabel = (mk: string) => `${mk.slice(0, 4)}년 ${Number(mk.slice(5))}월`;

function StudentChip({ s }: { s: HallStudent }) {
  return (
    <li className="flex min-h-tap items-center gap-2 rounded-md bg-paper px-3 text-base">
      {s.rank !== undefined && (
        <span className="w-8 font-extrabold text-primary-700">{s.rank}위</span>
      )}
      <span className="text-ink-muted">{s.className}</span>
      <span className="font-semibold">
        {s.name ? `${s.name} (${s.displayName})` : s.displayName}
      </span>
      {s.gifted && (
        <span title="주간 선물" aria-label="주간 선물 받음" data-testid="gifted">
          🎁
        </span>
      )}
      {s.points !== undefined && (
        <span className="ml-auto font-bold text-primary-700">{s.points}P</span>
      )}
    </li>
  );
}

function GradeLists({
  groups,
  emptyText,
}: {
  groups: Array<{ grade: number; students: HallStudent[] }>;
  emptyText: string;
}) {
  const nonEmpty = groups.filter((g) => g.students.length > 0);
  if (nonEmpty.length === 0) return <EmptyState icon="🏆" title={emptyText} />;
  return (
    <div className="space-y-3">
      {nonEmpty.map((g) => (
        <Card key={g.grade} title={`${g.grade}학년`}>
          <ul className="space-y-1">
            {g.students.map((s) => (
              <StudentChip key={s.userId} s={s} />
            ))}
          </ul>
        </Card>
      ))}
    </div>
  );
}

function ClassTable({ classes }: { classes: HallClassRow[] }) {
  return (
    <table className="w-full text-left text-base">
      <thead>
        <tr className="border-b border-line text-ink-muted">
          <th className="py-2 pr-2">반</th>
          <th className="py-2 pr-2">평균 포인트</th>
          <th className="py-2">리포트 참여율</th>
        </tr>
      </thead>
      <tbody>
        {classes.map((c) => (
          <tr key={c.classId} className="border-b border-line/60">
            <td className="py-2 pr-2 font-semibold">{c.className}</td>
            <td className="py-2 pr-2">{c.avgPoints}P</td>
            <td className="py-2">{Math.round(c.participationRate * 100)}%</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function AwardList({ awards }: { awards: HallAward[] }) {
  return (
    <ul className="space-y-2">
      {awards.map((a) => (
        <li
          key={`${a.category}-${a.student.userId}`}
          className="rounded-md border border-line bg-paper px-3 py-2"
        >
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="primary">{a.label}</Badge>
            <span className="text-base text-ink-muted">{a.grade}학년</span>
            <span className="text-base font-bold">
              {a.student.className}{' '}
              {a.student.name
                ? `${a.student.name} (${a.student.displayName})`
                : a.student.displayName}
            </span>
          </div>
          {a.reason && <p className="mt-1 text-base text-ink-muted">{a.reason}</p>}
        </li>
      ))}
    </ul>
  );
}

function WeeklyTab() {
  const { me } = useMe();
  const canGift = !!me && (me.isApprover || me.role === 'admin');
  const [week, setWeek] = useState<string | undefined>(undefined);
  const q = useQuery({
    queryKey: ['hall', 'weekly', week ?? 'latest'],
    queryFn: () => hallApi.weekly(week),
  });
  if (q.isLoading) return <Spinner size="lg" className="text-primary-600" />;
  if (!q.data)
    return (
      <EmptyState
        icon="🏆"
        title="아직 명단이 없어요"
        description="매주 월요일 아침에 새로 올라와요."
      />
    );
  const d = q.data;
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={() => setWeek(d.prevWeekKey)}>
          ← 지난주
        </Button>
        <span className="text-lg font-bold" data-testid="week-label">
          {weekLabel(d.weekKey)}
        </span>
        <Button
          variant="ghost"
          disabled={!d.nextWeekKey}
          onClick={() => d.nextWeekKey && setWeek(d.nextWeekKey)}
        >
          다음주 →
        </Button>
      </div>
      <p className="text-base text-ink-muted">
        {d.showRank
          ? '교사 화면: 순위와 포인트가 보여요.'
          : '지난주에 열심히 실천한 친구들이에요. (가나다순)'}
      </p>
      <GradeLists groups={d.grades} emptyText="지난주 명단이 아직 없어요" />
      {canGift && <WeeklyGiftPanel week={d.weekKey} />}
      {d.classes.length > 0 && (
        <Card title="반별 평균">
          <ClassTable classes={d.classes} />
        </Card>
      )}
    </div>
  );
}

function MonthlyTab() {
  const [month, setMonth] = useState<string | undefined>(undefined);
  const q = useQuery({
    queryKey: ['hall', 'monthly', month ?? 'latest'],
    queryFn: () => hallApi.monthly(month),
  });
  if (q.isLoading) return <Spinner size="lg" className="text-primary-600" />;
  if (!q.data) return <EmptyState icon="🏆" title="아직 명단이 없어요" />;
  const d = q.data;
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={() => setMonth(d.prevMonthKey)}>
          ← 지난달
        </Button>
        <span className="text-lg font-bold" data-testid="month-label">
          {monthLabel(d.monthKey)}
        </span>
        <Button
          variant="ghost"
          disabled={!d.nextMonthKey}
          onClick={() => d.nextMonthKey && setMonth(d.nextMonthKey)}
        >
          다음달 →
        </Button>
      </div>
      {!d.confirmed ? (
        <EmptyState
          icon="🗓️"
          title="아직 결산 전이에요"
          description="선생님이 확정하면 여기에 올라와요."
        />
      ) : (
        <>
          {d.awards.length > 0 && (
            <Card title="이 달의 명예의 전당">
              <AwardList awards={d.awards} />
            </Card>
          )}
          {d.winnerClass && (
            <Card tone="primary" title="이 달의 학급">
              <p className="text-xl font-extrabold">🎉 {d.winnerClass.className}</p>
              <p className="text-base text-ink-muted">
                평균 {d.winnerClass.avgPoints}P · 참여율{' '}
                {Math.round(d.winnerClass.participationRate * 100)}%
              </p>
            </Card>
          )}
          <h2 className="text-lg font-bold">포인트 상위 (선물 대상)</h2>
          <GradeLists groups={d.giftTargets} emptyText="선정된 친구가 없어요" />
          {d.growth.length > 0 && (
            <>
              <h2 className="text-lg font-bold">🌱 성장률 부문</h2>
              <GradeLists groups={d.growth} emptyText="" />
            </>
          )}
        </>
      )}
    </div>
  );
}

function ClassTab() {
  const q = useQuery({ queryKey: ['hall', 'classes'], queryFn: hallApi.classes });
  if (q.isLoading) return <Spinner size="lg" className="text-primary-600" />;
  if (!q.data) return <EmptyState icon="🏫" title="아직 기록이 없어요" />;
  return (
    <div className="space-y-4">
      <Card title="이 달의 학급 (월별)">
        {q.data.months.length === 0 ? (
          <p className="text-base text-ink-muted">첫 달 결산이 끝나면 여기에 기록돼요.</p>
        ) : (
          <ul className="space-y-1">
            {q.data.months.map((m) => (
              <li
                key={m.monthKey}
                className="flex min-h-tap items-center gap-2 rounded-md bg-paper px-3 text-base"
              >
                <span className="text-ink-muted">{monthLabel(m.monthKey)}</span>
                <span className="font-bold">🎉 {m.className}</span>
                <span className="ml-auto text-ink-muted">평균 {m.avgPoints}P</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
      {q.data.latestWeek && (
        <Card title={`지난주 반별 평균 (${weekLabel(q.data.latestWeek.weekKey)})`}>
          <ClassTable classes={q.data.latestWeek.classes} />
        </Card>
      )}
    </div>
  );
}

function AllTimeTab() {
  const q = useQuery({ queryKey: ['hall', 'all-time'], queryFn: hallApi.allTime });
  if (q.isLoading) return <Spinner size="lg" className="text-primary-600" />;
  if (!q.data || q.data.months.length === 0)
    return (
      <EmptyState
        icon="📜"
        title="아직 역대 기록이 없어요"
        description="첫 달 결산이 끝나면 여기에 쌓여요."
      />
    );
  return (
    <div className="space-y-4">
      {q.data.months.map((m) => (
        <Card key={m.monthKey} title={monthLabel(m.monthKey)}>
          {m.winnerClass && (
            <p className="mb-2 text-base">
              🎉 이 달의 학급: <strong>{m.winnerClass.className}</strong>
            </p>
          )}
          <p className="mb-2 text-base text-ink-muted">포인트 상위 선물 {m.giftCount}명</p>
          {m.awards.length > 0 ? (
            <AwardList awards={m.awards} />
          ) : (
            <p className="text-base text-ink-muted">부문 선정 없음</p>
          )}
        </Card>
      ))}
    </div>
  );
}

/** 명예의 전당 4탭 (HOF-06). 학생은 마스킹 이름·순위 없음, 교사는 순위·포인트 */
export function HallOfFamePage() {
  const [tab, setTab] = useState<Tab>('주간 TOP');
  return (
    <>
      <PageHeader title="명예의 전당" />
      <div
        role="tablist"
        aria-label="명예의 전당 구분"
        className="mb-4 grid grid-cols-4 gap-1 rounded-lg bg-primary-100 p-1"
      >
        {TABS.map((t) => (
          <button
            key={t}
            role="tab"
            type="button"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={cn(
              'min-h-tap rounded-md text-base font-bold',
              tab === t ? 'bg-surface text-primary-800 shadow-card' : 'text-ink-muted',
            )}
          >
            {t}
          </button>
        ))}
      </div>
      {tab === '주간 TOP' && <WeeklyTab />}
      {tab === '월간' && <MonthlyTab />}
      {tab === '학급' && <ClassTab />}
      {tab === '역대' && <AllTimeTab />}
    </>
  );
}
