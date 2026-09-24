import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AwardCandidateView, SettlementView } from '@server-types/api';
import { useState } from 'react';
import { errorMessage } from '@/api/client';
import { settlementsApi } from '@/api/settlements';
import { PageHeader } from '@/components/layout/PageHeader';
import { Badge, Button, Card, Input, Spinner, Textarea } from '@/components/ui';

const CATEGORIES = [
  { key: 'phonefree', label: '이 달의 폰프리 실천왕' },
  { key: 'reporter', label: '이 달의 RAS 기자' },
  { key: 'participation', label: '이 달의 참여왕' },
] as const;
type Category = (typeof CATEGORIES)[number]['key'];

const SKIP_LABEL: Record<string, string> = {
  consecutive: '지난달 선정 → 이번 달은 넘김',
  gift_target: '포인트 상위 선정자라 제외',
  below_median: '학년 중앙값 미만',
  weekly_gift: '주간 선물 수령자 제외',
};

function prevMonthKey(mk: string): string {
  const [y, m] = mk.split('-').map(Number) as [number, number];
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
}
function nextMonthKey(mk: string): string {
  const [y, m] = mk.split('-').map(Number) as [number, number];
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
}
const defaultMonth = () => {
  const now = new Date(Date.now() + 9 * 3600 * 1000);
  return prevMonthKey(now.toISOString().slice(0, 7));
};
const monthLabel = (mk: string) => `${mk.slice(0, 4)}년 ${Number(mk.slice(5))}월`;

type AwardPick = Record<Category, { userId: number; reason: string } | null>;

/** 월간 결산 확정 화면 (HOF-02~05, 08, ADM-03) */
export function SettlementPage() {
  const qc = useQueryClient();
  const [month, setMonth] = useState(defaultMonth);
  const q = useQuery({ queryKey: ['settlement', month], queryFn: () => settlementsApi.get(month) });
  const [giftCount, setGiftCount] = useState<number | null>(null);
  const [growthCount, setGrowthCount] = useState<number | null>(null);
  const [allowUsers, setAllowUsers] = useState<Set<number>>(new Set());
  const [allowClass, setAllowClass] = useState(false);
  const [excludeGift, setExcludeGift] = useState<boolean | null>(null);
  const [picks, setPicks] = useState<Record<number, AwardPick>>({});
  const [note, setNote] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setGiftCount(null);
    setGrowthCount(null);
    setAllowUsers(new Set());
    setAllowClass(false);
    setPicks({});
  };
  const refresh = () => void qc.invalidateQueries({ queryKey: ['settlement', month] });
  const draft = useMutation({
    mutationFn: () => settlementsApi.draft(month, excludeGift ?? undefined),
    onSuccess: () => {
      setMsg('초안을 다시 만들었어요.');
      reset();
      refresh();
    },
    onError: (e) => setError(errorMessage(e)),
  });
  const confirm = useMutation({
    mutationFn: (s: SettlementView) =>
      settlementsApi.confirm(month, {
        perGradeGiftCount: giftCount ?? s.perGradeGiftCount,
        perGradeGrowthCount: growthCount ?? s.perGradeGrowthCount,
        allowConsecutiveUserIds: [...allowUsers],
        allowConsecutiveClass: allowClass,
        excludeWeeklyGift: excludeGift ?? s.excludeWeeklyGift,
        awards: Object.entries(picks).flatMap(([, p]) =>
          (Object.keys(p) as Category[]).flatMap((cat) =>
            p[cat] ? [{ category: cat, userId: p[cat].userId, reason: p[cat].reason }] : [],
          ),
        ),
        note: note || undefined,
      }),
    onSuccess: (r) => {
      setMsg(
        `확정했어요. 포인트 상위 ${r.granted.monthlyTop}명, 성장률 ${r.granted.growth}명, 부문 ${r.granted.awards}명에게 포인트를 줬어요.${r.warnings.length ? ' ' + r.warnings.join(' ') : ''}`,
      );
      void qc.invalidateQueries({ queryKey: ['hall'] });
      refresh();
    },
    onError: (e) => setError(errorMessage(e)),
  });

  const s = q.data;
  const confirmed = s?.status === 'confirmed';
  const setPick = (grade: number, cat: Category, v: { userId: number; reason: string } | null) =>
    setPicks((p) => ({
      ...p,
      [grade]: {
        ...(p[grade] ?? { phonefree: null, reporter: null, participation: null }),
        [cat]: v,
      },
    }));
  const toggleAllow = (userId: number) =>
    setAllowUsers((set) => {
      const n = new Set(set);
      if (n.has(userId)) n.delete(userId);
      else n.add(userId);
      return n;
    });

  const candidateRow = (grade: number, cat: Category, c: AwardCandidateView) => {
    const pick = picks[grade]?.[cat];
    const selectedNow = confirmed ? c.status === 'selected' : pick?.userId === c.userId;
    return (
      <li
        key={c.userId}
        className={`rounded-md border px-3 py-2 ${selectedNow ? 'border-primary-500 bg-primary-50' : 'border-line'}`}
      >
        <div className="flex flex-wrap items-center gap-2 text-base">
          {!confirmed && (
            <input
              type="radio"
              name={`award-${grade}-${cat}`}
              className="h-5 w-5"
              checked={selectedNow}
              onChange={() =>
                setPick(grade, cat, {
                  userId: c.userId,
                  reason: pick?.userId === c.userId ? pick.reason : '',
                })
              }
              aria-label={`${c.name} 선정`}
            />
          )}
          <span className="font-bold">{c.rank}위</span>
          <span className="font-semibold">
            {c.className} {c.studentNo}번 {c.name}
          </span>
          <span className="text-ink-muted">{c.score}점</span>
          {c.status === 'selected' && <Badge tone="primary">선정</Badge>}
          <span className="ml-auto text-ink-muted">
            {Object.entries(c.breakdown)
              .map(([k, v]) => `${k} ${v}`)
              .join(' · ')}
          </span>
        </div>
        {c.warnings.map((w) => (
          <p key={w} className="mt-1 text-base text-warn-600">
            ⚠ {w}
          </p>
        ))}
        {c.reason && <p className="mt-1 text-base">사유: {c.reason}</p>}
        {!confirmed && selectedNow && (
          <Input
            label="선정 이유 (학생에게 알림으로 가요)"
            className="mt-2"
            value={pick?.reason ?? ''}
            onChange={(e) => setPick(grade, cat, { userId: c.userId, reason: e.target.value })}
            maxLength={200}
          />
        )}
      </li>
    );
  };

  return (
    <>
      <PageHeader
        title="월간 결산"
        description="포인트 상위·성장률·학급 보상은 자동 산출돼요. 3부문은 후보 중에서 골라 이유를 적고 확정해요."
        action={
          s && (
            <Badge tone={confirmed ? 'success' : s.status === 'draft' ? 'info' : 'neutral'}>
              {confirmed ? '확정됨' : s.status === 'draft' ? '초안' : '결산 없음'}
            </Badge>
          )
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Button
          variant="secondary"
          onClick={() => {
            setMonth(prevMonthKey(month));
            reset();
          }}
        >
          ← {monthLabel(prevMonthKey(month))}
        </Button>
        <span className="text-xl font-extrabold" data-testid="settlement-month">
          {monthLabel(month)}
        </span>
        <Button
          variant="secondary"
          onClick={() => {
            setMonth(nextMonthKey(month));
            reset();
          }}
        >
          {monthLabel(nextMonthKey(month))} →
        </Button>
        {s && !confirmed && (
          <Button
            className="ml-auto"
            variant="secondary"
            loading={draft.isPending}
            onClick={() => draft.mutate()}
          >
            초안 다시 만들기
          </Button>
        )}
        {s && s.id && (
          <a
            href={settlementsApi.giftListUrl(month)}
            download
            className="inline-flex min-h-tap items-center rounded-md border-2 border-accent-500 px-4 text-base font-semibold text-accent-700"
          >
            선물 명단 CSV
          </a>
        )}
      </div>
      {msg && (
        <p className="mb-3 rounded-md bg-success-50 px-3 py-2 text-base text-success-600">{msg}</p>
      )}
      {error && (
        <p
          role="alert"
          className="mb-3 rounded-md bg-danger-50 px-3 py-2 text-base text-danger-600"
        >
          {error}
        </p>
      )}
      {q.isLoading && <Spinner className="text-accent-600" />}
      {s && s.status === 'none' && (
        <Card>
          <p className="text-base">
            이 달은 아직 끝나지 않았거나 결산 데이터가 없어요. 지난달 이전만 결산할 수 있어요.
          </p>
        </Card>
      )}
      {s && s.status !== 'none' && (
        <div className="space-y-4">
          <Card title="인원 설정">
            <div className="flex flex-wrap items-end gap-3">
              <Input
                label="학년별 선물 인원"
                type="number"
                className="w-36"
                disabled={confirmed}
                value={giftCount ?? s.perGradeGiftCount}
                onChange={(e) => setGiftCount(Number(e.target.value))}
              />
              <Input
                label="학년별 성장률 인원"
                type="number"
                className="w-36"
                disabled={confirmed || s.isFirstMonth}
                value={growthCount ?? s.perGradeGrowthCount}
                onChange={(e) => setGrowthCount(Number(e.target.value))}
              />
              <label
                className="flex min-h-tap items-center gap-2 text-base"
                data-testid="exclude-gift"
              >
                <input
                  type="checkbox"
                  className="h-5 w-5"
                  disabled={confirmed}
                  checked={excludeGift ?? s.excludeWeeklyGift}
                  onChange={(e) => setExcludeGift(e.target.checked)}
                />
                주간 선물 받은 학생은 포인트 상위에서 제외 (바꾸면 "초안 다시 만들기")
              </label>
              <p className="text-base text-ink-muted">
                {s.isFirstMonth
                  ? '첫 달이라 성장률 부문은 운영하지 않아요.'
                  : '지난달 선정자는 자동으로 넘겨요. 예외를 허용하려면 아래에서 체크하세요.'}{' '}
                현재 선물 대상 {s.giftCount}명.
              </p>
            </div>
            {s.warnings.map((w) => (
              <p key={w} className="mt-2 text-base text-warn-600">
                ⚠ {w}
              </p>
            ))}
          </Card>

          <Card title="학급 보상 (반별 평균 포인트 1위)">
            <table className="w-full text-left text-base">
              <thead>
                <tr className="border-b border-line text-ink-muted">
                  <th className="py-2 pr-3">순위</th>
                  <th className="py-2 pr-3">반</th>
                  <th className="py-2 pr-3">재적(동의)</th>
                  <th className="py-2 pr-3">평균</th>
                  <th className="py-2 pr-3">참여율</th>
                  <th className="py-2"></th>
                </tr>
              </thead>
              <tbody>
                {s.classes.map((c) => (
                  <tr
                    key={c.classId}
                    className="border-b border-line/60"
                    data-testid={`class-row-${c.classId}`}
                  >
                    <td className="py-2 pr-3">{c.rank}</td>
                    <td className="py-2 pr-3 font-semibold">{c.className}</td>
                    <td className="py-2 pr-3">{c.memberCount}명</td>
                    <td className="py-2 pr-3">{c.avgPoints}P</td>
                    <td className="py-2 pr-3">{Math.round(c.participationRate * 100)}%</td>
                    <td className="py-2">
                      {c.isWinner && <Badge tone="primary">이 달의 학급</Badge>}
                      {c.skippedReason === 'consecutive' && (
                        <label className="flex min-h-tap items-center gap-2 text-warn-600">
                          <span>{SKIP_LABEL.consecutive}</span>
                          {!confirmed && (
                            <>
                              <input
                                type="checkbox"
                                className="h-5 w-5"
                                checked={allowClass}
                                onChange={(e) => setAllowClass(e.target.checked)}
                              />
                              예외 허용
                            </>
                          )}
                        </label>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          {s.grades.map((g) => (
            <Card key={g.grade} title={`${g.grade}학년`}>
              <h3 className="mb-2 text-base font-bold">포인트 상위 (선물 대상)</h3>
              <table className="mb-4 w-full text-left text-base">
                <thead>
                  <tr className="border-b border-line text-ink-muted">
                    <th className="py-1 pr-3">순위</th>
                    <th className="py-1 pr-3">학생</th>
                    <th className="py-1 pr-3">포인트</th>
                    <th className="py-1 pr-3">동점 근거</th>
                    <th className="py-1">선정</th>
                  </tr>
                </thead>
                <tbody>
                  {g.ranking
                    .slice(0, Math.max(10, (giftCount ?? s.perGradeGiftCount) + 3))
                    .map((r) => (
                      <tr
                        key={r.userId}
                        className={`border-b border-line/60 ${r.selected ? 'bg-primary-50' : ''}`}
                        data-testid={`rank-row-${r.userId}`}
                      >
                        <td className="py-1 pr-3">{r.rank}</td>
                        <td className="py-1 pr-3 font-semibold">
                          {r.className} {r.studentNo}번 {r.name}
                        </td>
                        <td className="py-1 pr-3">{r.points}P</td>
                        <td className="py-1 pr-3 text-ink-muted">
                          {r.tiebreak
                            ? `리포트 ${r.tiebreak.reportCount} · 기사 ${r.tiebreak.articleCount} · 활동 ${r.tiebreak.activeDays}일`
                            : ''}
                        </td>
                        <td className="py-1">
                          {r.selected && <Badge tone="primary">선물</Badge>}
                          {r.skippedReason === 'consecutive' && (
                            <label className="flex min-h-tap items-center gap-2 text-warn-600">
                              {SKIP_LABEL.consecutive}
                              {!confirmed && (
                                <>
                                  <input
                                    type="checkbox"
                                    className="h-5 w-5"
                                    checked={allowUsers.has(r.userId)}
                                    onChange={() => toggleAllow(r.userId)}
                                  />
                                  예외 허용
                                </>
                              )}
                            </label>
                          )}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>

              {g.growth.length > 0 && (
                <>
                  <h3 className="mb-2 text-base font-bold">🌱 성장률 부문</h3>
                  <table className="mb-4 w-full text-left text-base">
                    <thead>
                      <tr className="border-b border-line text-ink-muted">
                        <th className="py-1 pr-3">순위</th>
                        <th className="py-1 pr-3">학생</th>
                        <th className="py-1 pr-3">지난달 → 이번 달</th>
                        <th className="py-1 pr-3">성장률</th>
                        <th className="py-1">선정</th>
                      </tr>
                    </thead>
                    <tbody>
                      {g.growth.slice(0, 8).map((r) => (
                        <tr
                          key={r.userId}
                          className={`border-b border-line/60 ${r.selected ? 'bg-primary-50' : ''}`}
                        >
                          <td className="py-1 pr-3">{r.rank}</td>
                          <td className="py-1 pr-3 font-semibold">
                            {r.className} {r.studentNo}번 {r.name}
                          </td>
                          <td className="py-1 pr-3">
                            {r.prevPoints}P → {r.points}P
                          </td>
                          <td className="py-1 pr-3">+{Math.round(r.growthRate * 100)}%</td>
                          <td className="py-1">
                            {r.selected && <Badge tone="success">성장</Badge>}
                            {r.skippedReason && (
                              <label className="flex min-h-tap items-center gap-2 text-ink-muted">
                                {SKIP_LABEL[r.skippedReason] ?? r.skippedReason}
                                {r.skippedReason === 'consecutive' && !confirmed && (
                                  <>
                                    <input
                                      type="checkbox"
                                      className="h-5 w-5"
                                      checked={allowUsers.has(r.userId)}
                                      onChange={() => toggleAllow(r.userId)}
                                    />
                                    예외 허용
                                  </>
                                )}
                              </label>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}

              {CATEGORIES.map((cat) => (
                <div key={cat.key} className="mb-3">
                  <h3 className="mb-1 text-base font-bold">{cat.label}</h3>
                  {g.awards[cat.key].length === 0 ? (
                    <p className="text-base text-ink-muted">자격이 되는 후보가 없어요.</p>
                  ) : (
                    <ul className="space-y-1">
                      {g.awards[cat.key].map((c) => candidateRow(g.grade, cat.key, c))}
                    </ul>
                  )}
                </div>
              ))}
            </Card>
          ))}

          {!confirmed && (
            <Card tone="accent" title="확정">
              <Textarea
                label="메모 (선택)"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                maxLength={500}
              />
              <p className="mt-2 text-base text-ink-muted">
                확정하면 포인트 상위 MONTHLY_TOP 50P, 성장률 GROWTH_AWARD 50P, 부문 선정
                MONTHLY_AWARD 100P가 지급되고 알림이 가요. 확정 후에는 되돌릴 수 없어요.
              </p>
              <Button
                size="lg"
                className="mt-3"
                loading={confirm.isPending}
                onClick={() => {
                  if (
                    window.confirm(
                      `${monthLabel(month)} 결산을 확정할까요? 포인트가 지급되고 되돌릴 수 없어요.`,
                    )
                  )
                    confirm.mutate(s);
                }}
              >
                {monthLabel(month)} 결산 확정
              </Button>
            </Card>
          )}
          {confirmed && (
            <Card tone="primary">
              <p className="text-base">
                {s.confirmedAt ? new Date(s.confirmedAt).toLocaleString('ko-KR') : ''}{' '}
                {s.confirmedByName} 선생님이 확정했어요.
                {s.note ? ` 메모: ${s.note}` : ''}
              </p>
            </Card>
          )}
        </div>
      )}
    </>
  );
}
