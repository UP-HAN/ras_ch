import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { PointCapView, PointRuleView } from '@server-types/api';
import { useState } from 'react';
import type { GamifySettingsView } from '@server-types/api';
import { adminSettingsApi } from '@/api/adminSettings';
import { gamifyApi } from '@/api/gamify';
import { errorMessage } from '@/api/client';
import { PageHeader } from '@/components/layout/PageHeader';
import { Badge, Button, Card, Input, Spinner } from '@/components/ui';

const SCOPE_LABEL: Record<PointCapView['scope'], string> = {
  day: '하루',
  week: '주',
  month: '달',
  per_object: '글·댓글당',
  streak: '연속',
};

function capText(c: PointCapView): string {
  const who = c.by === 'granter' ? '교사당 ' : '';
  const share = c.share_codes?.length ? ` (+${c.share_codes.join(',')} 합산)` : '';
  return `${who}${SCOPE_LABEL[c.scope]} ${c.max}${c.unit === 'count' ? '회' : 'P'}${share}`;
}

function RuleEditor({
  rule,
  onClose,
  onSaved,
}: {
  rule: PointRuleView;
  onClose: () => void;
  onSaved: (r: PointRuleView) => void;
}) {
  const [amount, setAmount] = useState(String(rule.amount));
  const [min, setMin] = useState(rule.amountMin === null ? '' : String(rule.amountMin));
  const [max, setMax] = useState(rule.amountMax === null ? '' : String(rule.amountMax));
  const [caps, setCaps] = useState<PointCapView[]>(rule.caps.map((c) => ({ ...c })));
  const [isActive, setIsActive] = useState(rule.isActive);
  const [error, setError] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: () =>
      adminSettingsApi.updatePointRule(rule.code, {
        amount: Number(amount),
        amountMin: min.trim() === '' ? null : Number(min),
        amountMax: max.trim() === '' ? null : Number(max),
        caps,
        isActive,
      }),
    onSuccess: onSaved,
    onError: (e) => setError(errorMessage(e)),
  });
  const setCap = (i: number, patch: Partial<PointCapView>) =>
    setCaps((cs) => cs.map((c, j) => (j === i ? { ...c, ...patch } : c)));

  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center bg-accent-900/40 p-4"
      role="dialog"
      aria-modal="true"
    >
      <Card title={`${rule.name} (${rule.code})`} className="w-full max-w-lg">
        <p className="mb-3 text-base text-ink-muted">{rule.description}</p>
        <div className="grid grid-cols-3 gap-2">
          <Input
            label="포인트"
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
          <Input
            label="최소(범위형)"
            type="number"
            value={min}
            onChange={(e) => setMin(e.target.value)}
          />
          <Input
            label="최대(범위형)"
            type="number"
            value={max}
            onChange={(e) => setMax(e.target.value)}
          />
        </div>
        <p className="mt-4 mb-1 text-base font-semibold">상한</p>
        <div className="space-y-2">
          {caps.map((c, i) => (
            <div
              key={i}
              className="flex flex-wrap items-center gap-2 rounded-md border border-line p-2"
            >
              <select
                aria-label="범위"
                className="min-h-tap rounded-md border-2 border-line-strong bg-surface px-2 text-base"
                value={c.scope}
                onChange={(e) => setCap(i, { scope: e.target.value as PointCapView['scope'] })}
              >
                {(Object.keys(SCOPE_LABEL) as PointCapView['scope'][]).map((s) => (
                  <option key={s} value={s}>
                    {SCOPE_LABEL[s]}
                  </option>
                ))}
              </select>
              <input
                aria-label="최대"
                type="number"
                className="min-h-tap w-24 rounded-md border-2 border-line-strong bg-surface px-2 text-base"
                value={c.max}
                onChange={(e) => setCap(i, { max: Number(e.target.value) })}
              />
              <select
                aria-label="단위"
                className="min-h-tap rounded-md border-2 border-line-strong bg-surface px-2 text-base"
                value={c.unit}
                onChange={(e) => setCap(i, { unit: e.target.value as PointCapView['unit'] })}
              >
                <option value="count">회</option>
                <option value="points">P</option>
              </select>
              <label className="flex min-h-tap items-center gap-1 text-base">
                <input
                  type="checkbox"
                  className="h-5 w-5"
                  checked={c.by === 'granter'}
                  onChange={(e) => setCap(i, { by: e.target.checked ? 'granter' : undefined })}
                />
                교사당
              </label>
              <button
                type="button"
                className="min-h-tap px-2 text-base text-danger-600 underline"
                onClick={() => setCaps((cs) => cs.filter((_, j) => j !== i))}
              >
                지우기
              </button>
            </div>
          ))}
          <Button
            variant="secondary"
            onClick={() => setCaps((cs) => [...cs, { scope: 'week', unit: 'count', max: 1 }])}
          >
            상한 추가
          </Button>
        </div>
        <label className="mt-4 flex min-h-tap items-center gap-2 text-base">
          <input
            type="checkbox"
            className="h-5 w-5"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
          />
          이 규칙 켜기
        </label>
        {error && (
          <p role="alert" className="mt-2 text-base font-medium text-danger-600">
            {error}
          </p>
        )}
        <p className="mt-2 text-base text-ink-muted">
          저장하면 버전이 {rule.version} → {rule.version + 1} 로 올라가고, 이후 지급부터 적용돼요.
          이미 지급된 포인트는 바뀌지 않아요.
        </p>
        <div className="mt-3 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            취소
          </Button>
          <Button loading={save.isPending} onClick={() => save.mutate()}>
            저장
          </Button>
        </div>
      </Card>
    </div>
  );
}

/** 등급 구간·주간 선물 인원·학급 미션 목표 (PT-07, HOF-01a, 게이미피케이션) */
function GamifySettingsCard() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['admin', 'gamify'], queryFn: gamifyApi.settings });
  const [form, setForm] = useState<GamifySettingsView | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: (v: GamifySettingsView) => gamifyApi.updateSettings(v),
    onSuccess: () => {
      setMsg('저장했어요. 등급은 바로 다시 계산돼요(강등 없음).');
      setError(null);
      setForm(null);
      void qc.invalidateQueries({ queryKey: ['admin', 'gamify'] });
    },
    onError: (e) => setError(errorMessage(e)),
  });
  if (!q.data) return null;
  const v = form ?? q.data;
  const num = (n: number) => (Number.isFinite(n) ? n : 0);
  const setT = (k: keyof GamifySettingsView['tierThresholds'], val: number) =>
    setForm({ ...v, tierThresholds: { ...v.tierThresholds, [k]: num(val) } });
  return (
    <Card title="등급 배지 · 주간 선물 · 학급 미션" className="mb-4" data-testid="gamify-settings">
      <p className="mb-3 text-base text-ink-muted">
        등급은 누적 포인트로 정해요(씨앗 → 새싹 → 꽃 → 열매 → 초롱별). 회수로 포인트가 줄어도 등급은
        내려가지 않아요.
      </p>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {(
          [
            ['sprout', '🌱 새싹부터'],
            ['flower', '🌸 꽃부터'],
            ['fruit', '🍎 열매부터'],
            ['star', '⭐ 초롱별부터'],
          ] as const
        ).map(([k, label]) => (
          <Input
            key={k}
            label={label}
            type="number"
            value={v.tierThresholds[k]}
            onChange={(e) => setT(k, Number(e.target.value))}
          />
        ))}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Input
          label="주간 선물 학년별 인원(기본)"
          type="number"
          value={v.weeklyGiftPerGrade}
          onChange={(e) => setForm({ ...v, weeklyGiftPerGrade: num(Number(e.target.value)) })}
        />
        <Input
          label="학급 미션 목표 제출률(%)"
          type="number"
          value={v.classMissionReportRate}
          onChange={(e) => setForm({ ...v, classMissionReportRate: num(Number(e.target.value)) })}
        />
      </div>
      {msg && <p className="mt-2 text-base text-success-600">{msg}</p>}
      {error && (
        <p role="alert" className="mt-2 text-base text-danger-600">
          {error}
        </p>
      )}
      <div className="mt-3 flex justify-end">
        <Button disabled={!form} loading={save.isPending} onClick={() => form && save.mutate(form)}>
          저장
        </Button>
      </div>
    </Card>
  );
}

/** 포인트 규칙표 편집 (PT-05, ADM-02): 금액·범위·상한·활성, 버전·이력 */
export function PointRulesPage() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['admin', 'point-rules'], queryFn: adminSettingsApi.pointRules });
  const [editing, setEditing] = useState<PointRuleView | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  return (
    <>
      <PageHeader
        title="포인트 규칙"
        description="규칙을 바꾸면 그다음 지급부터 적용돼요. 이미 준 포인트는 원장에 그대로 남아요."
      />
      {msg && (
        <p className="mb-3 rounded-md bg-success-50 px-3 py-2 text-base text-success-600">{msg}</p>
      )}
      <GamifySettingsCard />
      {q.isLoading && <Spinner className="text-accent-600" />}
      {q.data && (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-base">
              <thead>
                <tr className="border-b border-line text-ink-muted">
                  <th className="py-2 pr-3">규칙</th>
                  <th className="py-2 pr-3">포인트</th>
                  <th className="py-2 pr-3">상한</th>
                  <th className="py-2 pr-3">상태</th>
                  <th className="py-2 pr-3">버전</th>
                  <th className="py-2"></th>
                </tr>
              </thead>
              <tbody>
                {q.data.map((r) => (
                  <tr
                    key={r.code}
                    className="border-b border-line/60"
                    data-testid={`rule-${r.code}`}
                  >
                    <td className="py-2 pr-3">
                      <span className="font-semibold">{r.name}</span>
                      <span className="ml-2 text-ink-muted">{r.code}</span>
                    </td>
                    <td className="py-2 pr-3 font-bold text-accent-700">
                      {r.amountMin !== null && r.amountMax !== null
                        ? `${r.amountMin}~${r.amountMax}P`
                        : `${r.amount}P`}
                    </td>
                    <td className="py-2 pr-3">
                      {r.caps.length === 0 ? (
                        <span className="text-ink-muted">없음</span>
                      ) : (
                        r.caps.map((c, i) => (
                          <span key={i} className="mr-2 inline-block">
                            {capText(c)}
                          </span>
                        ))
                      )}
                    </td>
                    <td className="py-2 pr-3">
                      <Badge tone={r.isActive ? 'success' : 'neutral'}>
                        {r.isActive ? '켜짐' : '꺼짐'}
                      </Badge>
                    </td>
                    <td className="py-2 pr-3 text-ink-muted">v{r.version}</td>
                    <td className="py-2">
                      <Button variant="secondary" onClick={() => setEditing(r)}>
                        편집
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
      {editing && (
        <RuleEditor
          rule={editing}
          onClose={() => setEditing(null)}
          onSaved={(r) => {
            setEditing(null);
            setMsg(`${r.name} 규칙을 저장했어요. (v${r.version})`);
            void qc.invalidateQueries({ queryKey: ['admin', 'point-rules'] });
          }}
        />
      )}
    </>
  );
}
