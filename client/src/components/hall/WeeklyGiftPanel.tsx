import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { errorMessage } from '@/api/client';
import { weeklyGiftsApi } from '@/api/weeklyGifts';
import { Button, Card, Input, Spinner } from '@/components/ui';

/** 승인 교사용 주간 선물 패널 (HOF-01a, 01b): 학년별 상위 N · 개별 선택 · 취소 · CSV */
export function WeeklyGiftPanel({ week }: { week: string }) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['weekly-gifts', week],
    queryFn: () => weeklyGiftsApi.panel(week),
  });
  const [topN, setTopN] = useState<number | null>(null);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['weekly-gifts', week] });
    void qc.invalidateQueries({ queryKey: ['hall'] });
  };
  const grant = useMutation({
    mutationFn: (input: { topN?: number; userIds?: number[] }) => weeklyGiftsApi.grant(week, input),
    onSuccess: (r) => {
      setMsg(
        `선물 ${r.granted}명에게 줬어요.${r.skipped ? ` (이미 받은 ${r.skipped}명은 건너뜀)` : ''}`,
      );
      setError(null);
      setPicked(new Set());
      refresh();
    },
    onError: (e) => setError(errorMessage(e)),
  });
  const cancel = useMutation({
    mutationFn: (userId: number) => weeklyGiftsApi.cancel(week, userId),
    onSuccess: () => {
      setMsg('선물을 취소하고 포인트를 회수했어요.');
      refresh();
    },
    onError: (e) => setError(errorMessage(e)),
  });
  if (q.isLoading) return <Spinner className="text-accent-600" />;
  if (!q.data) return null;
  const d = q.data;
  const n = topN ?? d.perGrade;
  const grades = [...new Set(d.candidates.map((c) => c.grade))].sort((a, b) => a - b);
  const toggle = (id: number) =>
    setPicked((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  return (
    <Card title="🎁 이번 주 선물 주기 (승인 교사)" tone="accent" data-testid="weekly-gift-panel">
      <p className="mb-3 text-base text-ink-muted">
        학년별 상위 N명(동점 포함)에게 주간 선물 20P를 주거나, 학생을 골라서 줄 수 있어요. 지금까지{' '}
        <strong>{d.giftedCount}명</strong>이 받았어요.
      </p>
      <div className="mb-3 flex flex-wrap items-end gap-2">
        <Input
          label="학년별 인원"
          type="number"
          className="w-32"
          min={0}
          max={30}
          value={n}
          onChange={(e) => setTopN(Number(e.target.value))}
        />
        <Button loading={grant.isPending} onClick={() => grant.mutate({ topN: n })}>
          상위 {n}명에게 주기
        </Button>
        <Button
          variant="secondary"
          disabled={picked.size === 0}
          loading={grant.isPending}
          onClick={() => grant.mutate({ userIds: [...picked] })}
        >
          고른 {picked.size}명에게 주기
        </Button>
        <a
          href={weeklyGiftsApi.csvUrl(week)}
          download
          className="inline-flex min-h-tap items-center rounded-md border-2 border-accent-500 px-4 text-base font-semibold text-accent-700"
        >
          선물 명단 CSV
        </a>
      </div>
      {msg && <p className="mb-2 text-base text-success-600">{msg}</p>}
      {error && (
        <p role="alert" className="mb-2 text-base text-danger-600">
          {error}
        </p>
      )}
      <div className="grid gap-3 lg:grid-cols-2">
        {grades.map((g) => (
          <div key={g}>
            <p className="mb-1 text-base font-bold">{g}학년</p>
            <ul className="space-y-1">
              {d.candidates
                .filter((c) => c.grade === g)
                .map((c) => (
                  <li
                    key={c.userId}
                    className={`flex min-h-tap items-center gap-2 rounded-md px-2 text-base ${c.gifted ? 'bg-success-50' : 'bg-surface'}`}
                    data-testid={`gift-row-${c.userId}`}
                  >
                    <input
                      type="checkbox"
                      aria-label={`${c.name} 선택`}
                      className="h-5 w-5"
                      disabled={c.gifted}
                      checked={picked.has(c.userId)}
                      onChange={() => toggle(c.userId)}
                    />
                    <span className="w-8 font-extrabold text-primary-700">{c.rankInGrade}위</span>
                    <span className="text-ink-muted">{c.className}</span>
                    <span className="font-semibold">{c.name}</span>
                    <span className="ml-auto font-bold text-primary-700">{c.points}P</span>
                    {c.gifted ? (
                      <>
                        <span>🎁</span>
                        <Button variant="ghost" onClick={() => cancel.mutate(c.userId)}>
                          취소
                        </Button>
                      </>
                    ) : null}
                  </li>
                ))}
            </ul>
          </div>
        ))}
      </div>
    </Card>
  );
}
