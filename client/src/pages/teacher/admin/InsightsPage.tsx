import { useQuery } from '@tanstack/react-query';
import type { BucketShare, InsightsView, Sample, Share, WeekPoint } from '@server-types/api';
import { statsApi } from '@/api/stats';
import { PageHeader } from '@/components/layout/PageHeader';
import { BarChart } from '@/components/ui/BarChart';
import { Badge, Button, Card, EmptyState, Spinner } from '@/components/ui';
import { TIER_META } from '@/lib/gamify';
import type { Tier } from '@server-types/db';

const wkShort = (wk: string) => `W${Number(wk.slice(6))}`;
const weekLabel = (wk: string) => `${wk.slice(0, 4)}년 ${Number(wk.slice(6))}주차`;
const minutesLabel = (m: number | null) =>
  m === null ? '–' : m >= 60 ? `${Math.floor(m / 60)}시간 ${m % 60}분` : `${m}분`;

const BASIS_LABEL: Record<Sample['basis'], string> = {
  all: '전체 학생 기준',
  submitted: '제출한 학생 기준',
  paired: '같은 학생 비교',
};

/** 표본 배지: 누구 기준, 몇 명/전체, 대표성 경고 */
function SampleBadge({ s, className }: { s: Sample; className?: string }) {
  const tone =
    s.label === 'ok'
      ? 'success'
      : s.label === 'partial'
        ? 'warn'
        : s.label === 'tiny'
          ? 'danger'
          : 'neutral';
  const note =
    s.label === 'none'
      ? '자료 없음'
      : s.label === 'tiny'
        ? '5명 미만 · 참고만'
        : s.label === 'partial'
          ? '전체의 절반 미만 · 일부 학생 결과'
          : '';
  return (
    <span
      className={`inline-flex flex-wrap items-center gap-1 text-base ${className ?? ''}`}
      data-testid="sample-badge"
    >
      <Badge tone={s.basis === 'all' ? 'info' : s.basis === 'paired' ? 'primary' : 'neutral'}>
        {BASIS_LABEL[s.basis]}
      </Badge>
      <span className="text-ink-muted">
        {s.n}/{s.of}명 ({s.pct}%)
      </span>
      {note && <Badge tone={tone}>{note}</Badge>}
    </span>
  );
}

function TrendChart({
  title,
  points,
  unit,
  color,
  subOf = (p) => `${p.sample.n}명`,
}: {
  title: string;
  points: WeekPoint[];
  unit: string;
  color?: string;
  subOf?: (p: WeekPoint) => string;
}) {
  const last = [...points].reverse().find((p) => p.value !== null);
  return (
    <div className="min-w-0">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <p className="text-base font-semibold">{title}</p>
        {last && <SampleBadge s={last.sample} />}
      </div>
      <BarChart
        data={points.map((p) => ({
          label: wkShort(p.weekKey),
          value: p.value,
          sub: `${wkShort(p.weekKey)}·${subOf(p)}`,
        }))}
        unit={unit}
        color={color}
        height={140}
      />
    </div>
  );
}

function Bucket({ title, items, s }: { title: string; items: BucketShare[]; s: Sample }) {
  return (
    <div className="min-w-0">
      <p className="mb-1 text-base font-semibold">{title}</p>
      <SampleBadge s={s} className="mb-2" />
      <ul className="space-y-1">
        {items.map((b) => (
          <li key={b.label} className="flex items-center gap-2 text-base">
            <span className="w-24 shrink-0 text-ink-muted">{b.label}</span>
            <div className="h-4 flex-1 overflow-hidden rounded-full bg-primary-100">
              <div className="h-full bg-primary-500" style={{ width: `${b.pct}%` }} />
            </div>
            <span className="w-24 text-right">
              {b.pct}% ({b.count}명)
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ShareList({ title, items }: { title: string; items: Share[] }) {
  return (
    <div>
      <p className="mb-1 text-base font-semibold">{title}</p>
      {items.length === 0 ? (
        <p className="text-base text-ink-muted">자료 없음</p>
      ) : (
        <ol className="space-y-1">
          {items.map((s, i) => (
            <li key={s.key} className="flex items-center gap-2 text-base">
              <span className="w-6 font-bold text-accent-700">{i + 1}</span>
              <span className="flex-1">{s.key}</span>
              <span className="text-ink-muted">
                {s.pct}% ({s.count})
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function Delta({ d }: { d: InsightsView['usage']['paired'] }) {
  if (d.deltaMinutes === null)
    return (
      <p className="text-base text-ink-muted">
        시작 구간과 최근 구간 모두 캡처 리포트를 낸 학생이 아직 없어요.
      </p>
    );
  const better = d.deltaMinutes < 0;
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <div className="rounded-md bg-paper p-3">
        <p className="text-base text-ink-muted">
          시작 구간 ({d.firstWeeks.map(wkShort).join('·')}) → 최근 구간 (
          {d.recentWeeks.map(wkShort).join('·')})
        </p>
        <p className="text-2xl font-extrabold">
          {minutesLabel(d.firstAvg)} → {minutesLabel(d.recentAvg)}
        </p>
        <p className={`text-lg font-bold ${better ? 'text-success-600' : 'text-danger-600'}`}>
          {better ? '▼' : '▲'} {Math.abs(d.deltaMinutes)}분 (
          {d.deltaPct !== null ? `${d.deltaPct > 0 ? '+' : ''}${d.deltaPct}%` : '–'})
        </p>
      </div>
      <div className="rounded-md bg-paper p-3">
        <p className="text-base text-ink-muted">사용시간이 줄어든 학생</p>
        <p className="text-3xl font-extrabold text-success-600">{d.decreasedPct}%</p>
        <p className="text-base text-ink-muted">
          늘어난 학생 {d.increasedPct}% · 같음 {d.samePct}%
        </p>
      </div>
      <div className="rounded-md bg-paper p-3">
        <p className="text-base text-ink-muted">비교한 학생</p>
        <p className="text-3xl font-extrabold">{d.sample.n}명</p>
        <SampleBadge s={d.sample} />
      </div>
    </div>
  );
}

/** 실천 변화 리포트 (관리자): 시작 주차~이번 주, 모든 수치에 표본(누구 기준·몇 명) 표시 */
export function InsightsPage() {
  const q = useQuery({ queryKey: ['admin', 'insights'], queryFn: statsApi.insights });
  if (q.isLoading) return <Spinner className="text-accent-600" />;
  if (!q.data) return <EmptyState icon="📊" title="불러오지 못했어요" />;
  const d = q.data;
  if (d.summary.students === 0)
    return (
      <>
        <PageHeader title="실천 변화 리포트" />
        <EmptyState
          icon="📊"
          title="아직 학생이 없어요"
          description="학생을 등록하고 리포트가 쌓이면 여기에 변화가 보여요."
        />
      </>
    );
  const s = d.summary;
  return (
    <div className="print:text-black">
      <PageHeader
        title="실천 변화 리포트"
        description={`${weekLabel(d.period.fromWeek)} ~ ${weekLabel(d.period.toWeek)} (${d.period.weeks.length}주). 모든 숫자 옆에 "누구 기준 · 몇 명"을 함께 보여 드려요.`}
        action={
          <Button variant="secondary" onClick={() => window.print()} className="print:hidden">
            인쇄
          </Button>
        }
      />

      <Card
        title="1. 이 리포트는 누구의 이야기인가요?"
        className="mb-4"
        data-testid="insights-summary"
      >
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            ['전체 학생', `${s.students}명`, '이 학년도 재학생'],
            [
              '리포트를 한 번이라도 낸 학생',
              `${s.reportedOnce.n}명 (${s.reportedOnce.pct}%)`,
              '참여 학생',
            ],
            [
              '사용시간 캡처를 낸 학생',
              `${s.capturedOnce.n}명 (${s.capturedOnce.pct}%)`,
              '사용시간 지표의 최대 표본',
            ],
            ['학부모 동의율', `${s.consentRate}%`, '캡처형 리포트 가능'],
            [
              '이번 주 제출',
              `${s.thisWeekSubmission.n}명 (${s.thisWeekSubmission.pct}%)`,
              weekLabel(d.period.toWeek),
            ],
            ['승인된 리포트', `${s.approvedReports}건`, '기간 전체'],
          ].map(([k, v, sub]) => (
            <div key={k} className="rounded-md bg-paper p-3">
              <p className="text-base text-ink-muted">{k}</p>
              <p className="text-2xl font-extrabold text-accent-700">{v}</p>
              <p className="text-base text-ink-muted">{sub}</p>
            </div>
          ))}
        </div>
        <p className="mt-3 rounded-md bg-info-50 px-3 py-2 text-base text-info-600">
          💡 <strong>전체 학생 기준</strong>은 분모가 재학생 전체예요.{' '}
          <strong>제출한 학생 기준</strong>은 그 주에 리포트를 낸 학생만의 평균이라 실천 중인 학생
          쪽으로 치우칠 수 있어요. <strong>같은 학생 비교</strong>는 시작 구간과 최근 구간을 둘 다
          낸 학생만 비교한 것이라 "정말 나아졌는지"를 볼 때 가장 믿을 만해요. 5명 미만이면 참고만
          하시고, 전체의 절반 미만이면 일부 학생의 결과로 보세요.
        </p>
      </Card>

      <Card title="2. 참여가 넓어지고 있나요? (전체 학생 기준)" className="mb-4">
        <div className="grid gap-6 lg:grid-cols-2 [&>*]:min-w-0">
          <TrendChart title="주간 리포트 제출률" points={d.participation.submissionRate} unit="%" />
          <TrendChart
            title="활동 학생 비율 (리포트·댓글·엄지척·읽기·투표 중 하나라도)"
            points={d.participation.activeRate}
            unit="%"
            color="bg-accent-500"
          />
          <TrendChart
            title="제출 중 캡처형 비율 (나머지는 일기형)"
            points={d.participation.captureShare}
            unit="%"
            color="bg-info-600"
            subOf={(p) => `${p.sample.n}/${p.sample.of}`}
          />
        </div>
      </Card>

      <Card title="3. 폰 사용시간이 줄고 있나요?" className="mb-4" tone="primary">
        <div className="mb-5">
          <p className="mb-2 text-lg font-bold">같은 학생 비교 — 가장 믿을 만한 지표</p>
          <Delta d={d.usage.paired} />
        </div>
        <div className="grid gap-6 lg:grid-cols-2 [&>*]:min-w-0">
          <TrendChart
            title="주차별 하루 평균 사용시간 (분)"
            points={d.usage.avgMinutes}
            unit="분"
          />
          <TrendChart
            title="주차별 중앙값 (분) — 극단값 영향 적음"
            points={d.usage.medianMinutes}
            unit="분"
            color="bg-info-600"
          />
          <TrendChart
            title="지난주보다 줄었다고 기록한 리포트 비율"
            points={d.usage.decreaseRate}
            unit="%"
            color="bg-success-600"
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <Bucket
              title={`시작 구간 분포 (${d.usage.paired.firstWeeks.map(wkShort).join('·')})`}
              items={d.usage.buckets.first}
              s={d.usage.buckets.firstSample}
            />
            <Bucket
              title={`최근 구간 분포 (${d.usage.paired.recentWeeks.map(wkShort).join('·') || '–'})`}
              items={d.usage.buckets.recent}
              s={d.usage.buckets.recentSample}
            />
          </div>
        </div>
      </Card>

      <Card title="4. 목표를 세우고 지키고 있나요?" className="mb-4">
        <div className="grid gap-6 lg:grid-cols-2 [&>*]:min-w-0">
          <TrendChart
            title="지난주 목표 달성 체크 비율"
            points={d.goals.achievedRate}
            unit="%"
            color="bg-success-600"
          />
          <div>
            <p className="mb-1 text-base font-semibold">가장 많이 세운 목표</p>
            <ol className="space-y-1">
              {d.goals.topGoals.map((g, i) => (
                <li key={g.text} className="flex items-center gap-2 text-base">
                  <span className="w-6 font-bold text-accent-700">{i + 1}</span>
                  <span className="flex-1">{g.text}</span>
                  <span className="text-ink-muted">{g.count}회</span>
                </li>
              ))}
            </ol>
          </div>
          <ShareList title="가장 많이 쓴 앱 종류 — 시작 구간" items={d.goals.categories.first} />
          <ShareList title="가장 많이 쓴 앱 종류 — 최근 구간" items={d.goals.categories.recent} />
          <ShareList title="가장 많이 쓴 앱 — 시작 구간" items={d.goals.apps.first} />
          <ShareList title="가장 많이 쓴 앱 — 최근 구간" items={d.goals.apps.recent} />
        </div>
      </Card>

      <Card title="5. 함께하는 문화가 자라고 있나요?" className="mb-4">
        <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {[
            ['토론 투표에 참여한 학생', d.community.debateVoteRate],
            ['토론 의견을 쓴 학생', d.community.debateOpinionRate],
            ['자치회 투표에 참여한 학생', d.community.councilVoteRate],
          ].map(([k, v]) => {
            const sm = v as Sample;
            return (
              <div key={k as string} className="rounded-md bg-paper p-3">
                <p className="text-base text-ink-muted">{k as string}</p>
                <p className="text-2xl font-extrabold text-accent-700">{sm.pct}%</p>
                <SampleBadge s={sm} />
              </div>
            );
          })}
        </div>
        <BarChart
          title="주차별 댓글 수"
          data={d.community.weekly.map((w) => ({
            label: wkShort(w.weekKey),
            value: w.comments,
            sub: `${wkShort(w.weekKey)}·${w.commenters.n}명`,
          }))}
          height={120}
        />
        <div className="mt-4 grid gap-6 lg:grid-cols-2 [&>*]:min-w-0">
          <BarChart
            title="주차별 엄지척 수"
            data={d.community.weekly.map((w) => ({ label: wkShort(w.weekKey), value: w.likes }))}
            color="bg-accent-500"
            height={110}
          />
          <BarChart
            title="주차별 끝까지 읽은 글 수"
            data={d.community.weekly.map((w) => ({ label: wkShort(w.weekKey), value: w.reads }))}
            color="bg-info-600"
            height={110}
          />
        </div>
      </Card>

      <Card title="6. 반별로 보면" className="mb-4">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-base">
            <thead>
              <tr className="border-b border-line text-ink-muted">
                <th className="py-2 pr-3">반</th>
                <th className="py-2 pr-3">학생</th>
                <th className="py-2 pr-3">리포트 1회+</th>
                <th className="py-2 pr-3">평균 제출률</th>
                <th className="py-2 pr-3">최근 2주 활동</th>
                <th className="py-2 pr-3">사용시간 변화 (같은 학생)</th>
                <th className="py-2 pr-3">줄어든 학생</th>
                <th className="py-2">비교 표본</th>
              </tr>
            </thead>
            <tbody>
              {d.classes.map((c) => (
                <tr
                  key={c.classId}
                  className="border-b border-line/60"
                  data-testid={`insights-class-${c.classId}`}
                >
                  <td className="py-2 pr-3 font-semibold">{c.className}</td>
                  <td className="py-2 pr-3">{c.students}명</td>
                  <td className="py-2 pr-3">{c.reportedOncePct}%</td>
                  <td className="py-2 pr-3">{c.avgSubmissionPct}%</td>
                  <td className="py-2 pr-3">{c.activePct}%</td>
                  <td
                    className={`py-2 pr-3 font-bold ${c.pairedDelta === null ? 'text-ink-muted' : c.pairedDelta < 0 ? 'text-success-600' : 'text-danger-600'}`}
                  >
                    {c.pairedDelta === null
                      ? '–'
                      : `${c.pairedDelta > 0 ? '+' : ''}${c.pairedDelta}분`}
                  </td>
                  <td className="py-2 pr-3">
                    {c.decreasedPct === null ? '–' : `${c.decreasedPct}%`}
                  </td>
                  <td className="py-2">
                    <SampleBadge s={c.pairedSample} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="7. 지금 등급·칭호 (참고)">
        <div className="grid gap-4 sm:grid-cols-2">
          <ul className="space-y-1">
            {d.tiers.map((t) => {
              const m = TIER_META[t.tier as Tier];
              return (
                <li key={t.tier} className="flex items-center gap-2 text-base">
                  <span className="w-24">
                    {m?.emoji} {m?.label ?? t.tier}
                  </span>
                  <div className="h-4 flex-1 overflow-hidden rounded-full bg-primary-100">
                    <div
                      className="h-full bg-primary-500"
                      style={{
                        width: `${s.students ? Math.round((t.count / s.students) * 100) : 0}%`,
                      }}
                    />
                  </div>
                  <span className="w-16 text-right">{t.count}명</span>
                </li>
              );
            })}
          </ul>
          <div className="rounded-md bg-paper p-3">
            <p className="text-base text-ink-muted">칭호를 하나라도 얻은 학생</p>
            <p className="text-2xl font-extrabold text-accent-700">{d.achievementsRate.pct}%</p>
            <SampleBadge s={d.achievementsRate} />
          </div>
        </div>
      </Card>
    </div>
  );
}
