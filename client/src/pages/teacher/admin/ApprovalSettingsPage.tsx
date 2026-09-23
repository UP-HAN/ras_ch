import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ReviewAssignmentView } from '@server-types/api';
import { useState } from 'react';
import { adminApi } from '@/api/admin';
import {
  adminSettingsApi,
  type ApprovalSettingInput,
  type AssignmentInput,
} from '@/api/adminSettings';
import { errorMessage } from '@/api/client';
import { PageHeader } from '@/components/layout/PageHeader';
import { Badge, Button, Card, Input, Spinner } from '@/components/ui';
import { POST_TYPE_LABEL } from '@/lib/reviewLabels';

const GRADES = [3, 4, 5, 6];
const SELECT = 'min-h-tap rounded-md border-2 border-line-strong bg-surface px-2 text-base';

/** APR-02b 프리셋: 보조(통과만, 5건) / 기본(통과+보류, 10건) / 선임(통과+보류, 20건) */
const PRESETS: Record<
  'assist' | 'basic' | 'senior',
  Pick<AssignmentInput, 'allowedResults' | 'dailyCap'>
> = {
  assist: { allowedResults: 'pass_only', dailyCap: 5 },
  basic: { allowedResults: 'pass_hold', dailyCap: 10 },
  senior: { allowedResults: 'pass_hold', dailyCap: 20 },
};
const PRESET_LABEL = { assist: '보조', basic: '기본', senior: '선임', custom: '직접' };

const today = () => new Date().toISOString().slice(0, 10);

function ApprovalSection() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['admin', 'approval-settings'],
    queryFn: adminSettingsApi.approvalSettings,
  });
  const classes = useQuery({ queryKey: ['admin', 'classes'], queryFn: adminApi.classes });
  const [form, setForm] = useState<ApprovalSettingInput>({
    scope: 'school',
    scopeId: null,
    mode: 'two_step',
    autoEscalateHours: 48,
    autoApproveTeacherReview: false,
  });
  const [error, setError] = useState<string | null>(null);
  const refresh = () => void qc.invalidateQueries({ queryKey: ['admin', 'approval-settings'] });
  const save = useMutation({
    mutationFn: () => adminSettingsApi.saveApprovalSetting(form),
    onSuccess: refresh,
    onError: (e) => setError(errorMessage(e)),
  });
  const remove = useMutation({
    mutationFn: (v: { scope: 'grade' | 'class'; scopeId: number }) =>
      adminSettingsApi.deleteApprovalSetting(v.scope, v.scopeId),
    onSuccess: refresh,
    onError: (e) => setError(errorMessage(e)),
  });

  return (
    <Card title="승인 모드 (반 → 학년 → 학교 순으로 적용)">
      {q.isLoading && <Spinner className="text-accent-600" />}
      {q.data && (
        <table className="mb-4 w-full text-left text-base">
          <thead>
            <tr className="border-b border-line text-ink-muted">
              <th className="py-2 pr-3">범위</th>
              <th className="py-2 pr-3">모드</th>
              <th className="py-2 pr-3">자동 승격</th>
              <th className="py-2 pr-3">교사 검토 통과 시 자동 승인</th>
              <th className="py-2"></th>
            </tr>
          </thead>
          <tbody>
            {q.data.map((s) => (
              <tr
                key={`${s.scope}-${s.scopeId}`}
                className="border-b border-line/60"
                data-testid={`approval-${s.scope}`}
              >
                <td className="py-2 pr-3 font-semibold">{s.label}</td>
                <td className="py-2 pr-3">
                  <Badge tone={s.mode === 'two_step' ? 'info' : 'neutral'}>
                    {s.mode === 'two_step' ? '2단계' : '교사 단독'}
                  </Badge>
                </td>
                <td className="py-2 pr-3">{s.autoEscalateHours}시간</td>
                <td className="py-2 pr-3">{s.autoApproveTeacherReview ? '켜짐' : '꺼짐'}</td>
                <td className="py-2">
                  <div className="flex gap-1">
                    <Button
                      variant="secondary"
                      onClick={() =>
                        setForm({
                          scope: s.scope,
                          scopeId: s.scopeId,
                          mode: s.mode,
                          autoEscalateHours: s.autoEscalateHours,
                          autoApproveTeacherReview: s.autoApproveTeacherReview,
                        })
                      }
                    >
                      불러오기
                    </Button>
                    {s.scope !== 'school' && s.scopeId !== null && (
                      <Button
                        variant="ghost"
                        onClick={() =>
                          remove.mutate({
                            scope: s.scope as 'grade' | 'class',
                            scopeId: s.scopeId as number,
                          })
                        }
                      >
                        지우기
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-base">
          <span className="mb-1 block font-semibold">범위</span>
          <select
            className={SELECT}
            value={form.scope}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                scope: e.target.value as ApprovalSettingInput['scope'],
                scopeId: null,
              }))
            }
          >
            <option value="school">학교 전체</option>
            <option value="grade">학년</option>
            <option value="class">반</option>
          </select>
        </label>
        {form.scope === 'grade' && (
          <label className="text-base">
            <span className="mb-1 block font-semibold">학년</span>
            <select
              className={SELECT}
              value={form.scopeId ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, scopeId: Number(e.target.value) }))}
            >
              <option value="">고르기</option>
              {GRADES.map((g) => (
                <option key={g} value={g}>
                  {g}학년
                </option>
              ))}
            </select>
          </label>
        )}
        {form.scope === 'class' && (
          <label className="text-base">
            <span className="mb-1 block font-semibold">반</span>
            <select
              className={SELECT}
              value={form.scopeId ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, scopeId: Number(e.target.value) }))}
            >
              <option value="">고르기</option>
              {classes.data?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="text-base">
          <span className="mb-1 block font-semibold">모드</span>
          <select
            className={SELECT}
            value={form.mode}
            onChange={(e) =>
              setForm((f) => ({ ...f, mode: e.target.value as ApprovalSettingInput['mode'] }))
            }
          >
            <option value="two_step">2단계(임원 검토 → 교사)</option>
            <option value="teacher_only">교사 단독</option>
          </select>
        </label>
        <Input
          label="자동 승격(시간)"
          type="number"
          className="w-32"
          value={form.autoEscalateHours}
          onChange={(e) => setForm((f) => ({ ...f, autoEscalateHours: Number(e.target.value) }))}
        />
        <label className="flex min-h-tap items-center gap-2 text-base">
          <input
            type="checkbox"
            className="h-5 w-5"
            checked={form.autoApproveTeacherReview}
            onChange={(e) => setForm((f) => ({ ...f, autoApproveTeacherReview: e.target.checked }))}
          />
          교사 검토 계정 통과 시 자동 승인
        </label>
        <Button loading={save.isPending} onClick={() => save.mutate()}>
          저장
        </Button>
      </div>
      {error && (
        <p role="alert" className="mt-2 text-base font-medium text-danger-600">
          {error}
        </p>
      )}
    </Card>
  );
}

const EMPTY_ASSIGNMENT: AssignmentInput = {
  grades: [],
  postTypes: ['report'],
  allowedResults: 'pass_only',
  dailyCap: 5,
  preset: 'assist',
  startsAt: today(),
  endsAt: null,
  isActive: true,
};

function AssignmentSection() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['admin', 'review-assignments'],
    queryFn: adminSettingsApi.reviewAssignments,
  });
  const candidates = useQuery({
    queryKey: ['admin', 'reviewer-candidates'],
    queryFn: adminSettingsApi.reviewerCandidates,
  });
  const [reviewerId, setReviewerId] = useState<number | ''>('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<AssignmentInput>(EMPTY_ASSIGNMENT);
  const [error, setError] = useState<string | null>(null);
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['admin', 'review-assignments'] });
    setEditingId(null);
    setForm(EMPTY_ASSIGNMENT);
    setReviewerId('');
  };
  const save = useMutation({
    mutationFn: async (): Promise<void> => {
      if (editingId !== null) await adminSettingsApi.updateAssignment(editingId, form);
      else await adminSettingsApi.createAssignment(Number(reviewerId), form);
    },
    onSuccess: refresh,
    onError: (e) => setError(errorMessage(e)),
  });
  const deactivate = useMutation({
    mutationFn: (id: number) => adminSettingsApi.deactivateAssignment(id),
    onSuccess: refresh,
    onError: (e) => setError(errorMessage(e)),
  });
  const applyPreset = (p: 'assist' | 'basic' | 'senior') =>
    setForm((f) => ({ ...f, preset: p, ...PRESETS[p] }));
  const loadRow = (a: ReviewAssignmentView) => {
    setEditingId(a.id);
    setForm({
      grades: a.grades,
      postTypes: a.postTypes,
      allowedResults: a.allowedResults,
      dailyCap: a.dailyCap,
      preset: a.preset,
      startsAt: a.startsAt,
      endsAt: a.endsAt,
      isActive: a.isActive,
    });
  };
  const toggleIn = (key: 'grades' | 'postTypes', v: number | string) =>
    setForm((f) => {
      const list = f[key] as Array<number | string>;
      const next = list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
      return { ...f, [key]: next };
    });

  return (
    <Card title="검토 담당 (자치회 임원·교사 검토 계정)">
      {q.isLoading && <Spinner className="text-accent-600" />}
      {q.data && (
        <table className="mb-4 w-full text-left text-base">
          <thead>
            <tr className="border-b border-line text-ink-muted">
              <th className="py-2 pr-3">담당자</th>
              <th className="py-2 pr-3">학년</th>
              <th className="py-2 pr-3">유형</th>
              <th className="py-2 pr-3">결과</th>
              <th className="py-2 pr-3">하루</th>
              <th className="py-2 pr-3">임기</th>
              <th className="py-2 pr-3">상태</th>
              <th className="py-2"></th>
            </tr>
          </thead>
          <tbody>
            {q.data.map((a) => (
              <tr key={a.id} className="border-b border-line/60" data-testid={`assignment-${a.id}`}>
                <td className="py-2 pr-3 font-semibold">
                  {a.reviewerName}
                  <span className="ml-1 text-ink-muted">
                    {a.reviewerClass ?? (a.reviewerKind === 'teacher' ? '교사 검토 계정' : '')}
                  </span>
                </td>
                <td className="py-2 pr-3">{a.grades.map((g) => `${g}학년`).join(', ')}</td>
                <td className="py-2 pr-3">
                  {a.postTypes.map((t) => POST_TYPE_LABEL[t] ?? t).join(', ')}
                </td>
                <td className="py-2 pr-3">
                  {a.allowedResults === 'pass_hold' ? '통과+보류' : '통과만'}
                </td>
                <td className="py-2 pr-3">{a.dailyCap}건</td>
                <td className="py-2 pr-3 text-ink-muted">
                  {a.startsAt} ~ {a.endsAt ?? ''}
                </td>
                <td className="py-2 pr-3">
                  <Badge tone={a.isActive ? 'success' : 'neutral'}>
                    {a.isActive ? '활성' : '중지'}
                  </Badge>
                </td>
                <td className="py-2">
                  <div className="flex gap-1">
                    <Button variant="secondary" onClick={() => loadRow(a)}>
                      수정
                    </Button>
                    {a.isActive && (
                      <Button variant="ghost" onClick={() => deactivate.mutate(a.id)}>
                        해제
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="rounded-md border border-line p-3">
        <p className="mb-2 text-base font-semibold">
          {editingId !== null ? `담당 #${editingId} 수정` : '새 담당 추가'}
        </p>
        <div className="flex flex-wrap items-end gap-3">
          {editingId === null && (
            <label className="text-base">
              <span className="mb-1 block font-semibold">담당자</span>
              <select
                className={SELECT}
                value={reviewerId}
                onChange={(e) => setReviewerId(e.target.value === '' ? '' : Number(e.target.value))}
              >
                <option value="">고르기</option>
                {candidates.data?.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.role === 'student'
                      ? `${c.className ?? ''} ${c.name} (${c.title ?? '임원'})`
                      : `${c.name} · 교사 검토 계정`}
                  </option>
                ))}
              </select>
            </label>
          )}
          <fieldset className="text-base">
            <legend className="mb-1 font-semibold">학년</legend>
            <div className="flex gap-2">
              {GRADES.map((g) => (
                <label key={g} className="flex min-h-tap items-center gap-1">
                  <input
                    type="checkbox"
                    className="h-5 w-5"
                    checked={form.grades.includes(g)}
                    onChange={() => toggleIn('grades', g)}
                  />
                  {g}
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset className="text-base">
            <legend className="mb-1 font-semibold">글 유형</legend>
            <div className="flex gap-2">
              {['report', 'article'].map((t) => (
                <label key={t} className="flex min-h-tap items-center gap-1">
                  <input
                    type="checkbox"
                    className="h-5 w-5"
                    checked={form.postTypes.includes(t)}
                    onChange={() => toggleIn('postTypes', t)}
                  />
                  {POST_TYPE_LABEL[t]}
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset className="text-base">
            <legend className="mb-1 font-semibold">프리셋</legend>
            <div className="flex gap-1">
              {(['assist', 'basic', 'senior'] as const).map((p) => (
                <Button
                  key={p}
                  variant={form.preset === p ? 'primary' : 'secondary'}
                  onClick={() => applyPreset(p)}
                >
                  {PRESET_LABEL[p]}
                </Button>
              ))}
            </div>
          </fieldset>
          <label className="text-base">
            <span className="mb-1 block font-semibold">허용 결과</span>
            <select
              className={SELECT}
              value={form.allowedResults}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  preset: 'custom',
                  allowedResults: e.target.value as AssignmentInput['allowedResults'],
                }))
              }
            >
              <option value="pass_only">통과만</option>
              <option value="pass_hold">통과 + 보류 요청</option>
            </select>
          </label>
          <Input
            label="하루 상한"
            type="number"
            className="w-28"
            value={form.dailyCap}
            onChange={(e) =>
              setForm((f) => ({ ...f, preset: 'custom', dailyCap: Number(e.target.value) }))
            }
          />
          <Input
            label="시작"
            type="date"
            className="w-44"
            value={form.startsAt}
            onChange={(e) => setForm((f) => ({ ...f, startsAt: e.target.value }))}
          />
          <Input
            label="끝(비우면 계속)"
            type="date"
            className="w-44"
            value={form.endsAt ?? ''}
            onChange={(e) => setForm((f) => ({ ...f, endsAt: e.target.value || null }))}
          />
          <label className="flex min-h-tap items-center gap-2 text-base">
            <input
              type="checkbox"
              className="h-5 w-5"
              checked={form.isActive}
              onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
            />
            활성
          </label>
          <Button loading={save.isPending} onClick={() => save.mutate()}>
            {editingId !== null ? '저장' : '추가'}
          </Button>
          {editingId !== null && (
            <Button variant="ghost" onClick={refresh}>
              취소
            </Button>
          )}
        </div>
        {error && (
          <p role="alert" className="mt-2 text-base font-medium text-danger-600">
            {error}
          </p>
        )}
      </div>
    </Card>
  );
}

function CouncilAccountSection() {
  const qc = useQueryClient();
  const teachers = useQuery({ queryKey: ['admin', 'teachers'], queryFn: adminApi.teachers });
  const [created, setCreated] = useState<{
    name: string;
    loginId: string;
    password: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const create = useMutation({
    mutationFn: (t: { id: number; name: string }) =>
      adminSettingsApi.createCouncilAccount(t.id).then((r) => ({ ...r, name: t.name })),
    onSuccess: (r) => {
      setCreated(r);
      void qc.invalidateQueries({ queryKey: ['admin', 'teachers'] });
      void qc.invalidateQueries({ queryKey: ['admin', 'reviewer-candidates'] });
      void qc.invalidateQueries({ queryKey: ['admin', 'review-assignments'] });
    },
    onError: (e) => setError(errorMessage(e)),
  });

  return (
    <Card title="교사 검토 계정 (APR-12)">
      <p className="mb-3 text-base text-ink-muted">
        교사가 임원과 같은 익명 검토 화면으로 1차 검토를 할 수 있는 연결 계정이에요. 만들면 교사
        화면의 &quot;검토 모드로 전환&quot; 버튼으로 바로 오갈 수 있어요. 검토 계정은 포인트를 받지
        않아요.
      </p>
      {created && (
        <div className="mb-3 rounded-md bg-accent-50 px-3 py-2 text-base">
          <strong>{created.name}</strong> 선생님 검토 계정{' '}
          <code className="font-bold">{created.loginId}</code> 를 만들었어요. 비밀번호{' '}
          <code className="rounded bg-surface px-2 py-1 text-xl font-extrabold">
            {created.password}
          </code>{' '}
          (지금만 보여요. 역할 전환 버튼을 쓰면 비밀번호 없이도 들어가요.)
        </div>
      )}
      {error && (
        <p role="alert" className="mb-2 text-base font-medium text-danger-600">
          {error}
        </p>
      )}
      <ul className="divide-y divide-line">
        {teachers.data?.map((t) => (
          <li key={t.id} className="flex items-center gap-3 py-2 text-base">
            <span className="font-semibold">{t.name}</span>
            <span className="text-ink-muted">{t.loginId}</span>
            {t.hasCouncilAccount ? (
              <Badge tone="success" className="ml-auto">
                검토 계정 있음
              </Badge>
            ) : (
              <Button
                className="ml-auto"
                variant="secondary"
                loading={create.isPending && create.variables?.id === t.id}
                onClick={() => create.mutate({ id: t.id, name: t.name })}
              >
                검토 계정 만들기
              </Button>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}

/** 승인·검토 설정 (APR-01, 02, 02a, 02b, 07, 12, 14) */
export function ApprovalSettingsPage() {
  return (
    <>
      <PageHeader
        title="승인·검토 설정"
        description="승인 모드, 자치회 검토 담당, 교사 검토 계정을 관리해요."
      />
      <div className="space-y-6">
        <ApprovalSection />
        <AssignmentSection />
        <CouncilAccountSection />
      </div>
    </>
  );
}
