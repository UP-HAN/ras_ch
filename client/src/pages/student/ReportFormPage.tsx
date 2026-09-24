import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { MyPostView, WeekContextView } from '@server-types/api';
import { useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { errorMessage } from '@/api/client';
import { postsApi } from '@/api/posts';
import { PageHeader } from '@/components/layout/PageHeader';
import { CaptureGuide } from '@/components/post/CaptureGuide';
import { ImagePicker } from '@/components/post/ImagePicker';
import { Badge, Button, Card, Input, Spinner, Textarea } from '@/components/ui';
import { cn } from '@/lib/cn';
import { PoliteNotice, PoliteWarning } from '@/components/common/PoliteNotice';
import { POLITE_HINT } from '@/lib/politeness';

const HELPERS = [
  '이번 주 저는 ___을(를) 가장 많이 썼어요. 왜냐하면 ',
  '폰을 오래 쓴 날은 ___한 날이었어요. ',
  '다음 주에는 ___ 대신 ___을(를) 해 보고 싶어요. ',
];

const CATEGORY_FALLBACK = ['동영상', '게임', 'SNS', '메신저', '웹툰·만화', '음악', '학습', '기타'];

/**
 * 리포트 작성·수정 (RPT-01, 02, 03, 05, 09, AUTH-08)
 *  - 캡처는 증빙일 뿐, 숫자(하루 평균·많이 쓴 앱)는 학생이 화면을 보고 직접 적는다
 *  - 학부모 미동의면 일기형만
 */
export function ReportFormPage() {
  const { id } = useParams();
  const editId = id ? Number(id) : null;
  const ctxQ = useQuery({
    queryKey: ['posts', 'week-context'],
    queryFn: postsApi.weekContext,
    enabled: editId === null,
  });
  const existingQ = useQuery({
    queryKey: ['posts', editId],
    queryFn: () => postsApi.get(editId as number) as Promise<MyPostView>,
    enabled: editId !== null,
  });
  const ready = editId === null ? !!ctxQ.data : !!existingQ.data;
  if (!ready) {
    return (
      <div className="flex justify-center py-16">
        <Spinner size="lg" className="text-primary-600" />
      </div>
    );
  }
  // 데이터가 준비된 뒤에 폼을 마운트해 초기값을 useState 초기화로 넣는다(effect 로 setState 하지 않음)
  return (
    <ReportForm
      key={editId ?? 'new'}
      editId={editId}
      ctx={ctxQ.data ?? null}
      existing={existingQ.data ?? null}
    />
  );
}

function ReportForm({
  editId,
  ctx,
  existing,
}: {
  editId: number | null;
  ctx: WeekContextView | null;
  existing: MyPostView | null;
}) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const avg0 = existing?.report?.avgMinutesPerDay ?? null;

  const [type, setType] = useState<'report' | 'diary'>(
    existing
      ? existing.type === 'diary'
        ? 'diary'
        : 'report'
      : ctx?.canUseCapture
        ? 'report'
        : 'diary',
  );
  const [weekKey, setWeekKey] = useState(existing?.weekKey ?? ctx?.defaultWeekKey ?? '');
  const [hours, setHours] = useState(avg0 === null ? '' : String(Math.floor(avg0 / 60)));
  const [minutes, setMinutes] = useState(avg0 === null ? '' : String(avg0 % 60));
  const [topCategory, setTopCategory] = useState(existing?.report?.topCategory ?? '');
  const [topApp, setTopApp] = useState(existing?.report?.topApp ?? '');
  const [body, setBody] = useState(existing?.body ?? '');
  const [goalText, setGoalText] = useState(existing?.goalText ?? '');
  const [goalAchieved, setGoalAchieved] = useState<boolean | null>(
    existing?.report?.goalAchieved ?? null,
  );
  const [goalReason, setGoalReason] = useState(existing?.report?.goalReason ?? '');
  const [visibility, setVisibility] = useState<'class' | 'school'>(existing?.visibility ?? 'class');
  const [catFile, setCatFile] = useState<File | null>(null);
  const [appFile, setAppFile] = useState<File | null>(null);
  const [fileErr, setFileErr] = useState<{ cat: string | null; app: string | null }>({
    cat: null,
    app: null,
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const limits = ctx?.limits ?? {
    bodyMin: 100,
    bodyMax: 1000,
    goalMax: 100,
    goalReasonMax: 200,
    topAppMax: 50,
  };
  const categories = ctx?.topCategories ?? CATEGORY_FALLBACK;
  const prevGoal = editId === null ? (ctx?.prevGoalText ?? null) : (existing?.prevGoalText ?? null);
  const canUseCapture =
    editId === null ? (ctx?.canUseCapture ?? true) : existing?.type === 'report';
  const bodyLen = useMemo(() => Array.from(body.trim()).length, [body]);
  const existingForWeek = editId === null && weekKey ? (ctx?.existing[weekKey] ?? null) : null;
  const existingImage = (kind: string) =>
    existing?.images.find((i) => i.kind === kind)?.url ?? null;

  const avgMinutes =
    hours === '' && minutes === '' ? null : Number(hours || 0) * 60 + Number(minutes || 0);

  const validate = (): string | null => {
    if (bodyLen < limits.bodyMin)
      return `성찰 글을 ${limits.bodyMin}자 이상 써 주세요. (지금 ${bodyLen}자)`;
    if (bodyLen > limits.bodyMax) return `성찰 글은 ${limits.bodyMax}자까지만요.`;
    const g = Array.from(goalText.trim()).length;
    if (g < 1 || g > limits.goalMax)
      return `다음 주 목표를 ${limits.goalMax}자 안에서 한 줄 적어 주세요.`;
    if (type === 'report') {
      if (avgMinutes === null) return '하루 평균 사용시간을 적어 주세요.';
      if (Number(minutes || 0) > 59) return '분은 0~59 사이로 적어 주세요.';
      if (!topCategory) return '가장 많이 쓴 종류를 골라 주세요.';
      if (!topApp.trim()) return '가장 많이 쓴 앱 이름을 적어 주세요.';
      if (editId === null && (!catFile || !appFile)) return '캡처 2장을 모두 올려 주세요.';
    }
    if (prevGoal && goalAchieved !== null && !goalReason.trim())
      return '지난주 목표에 대한 한 줄 이유를 적어 주세요.';
    return null;
  };

  const submit = async (e: FormEvent, asDraft = false) => {
    e.preventDefault();
    setError(null);
    const v = validate();
    if (v) return setError(v);
    setBusy(true);
    try {
      const values = {
        visibility,
        avgMinutes,
        topCategory: type === 'report' ? topCategory : '',
        topApp: type === 'report' ? topApp.trim() : '',
        body: body.trim(),
        goalText: goalText.trim(),
        goalAchieved: prevGoal ? goalAchieved : null,
        goalReason: prevGoal ? goalReason.trim() : '',
        submit: !asDraft,
      };
      const saved =
        editId === null
          ? await postsApi.create({ ...values, type, weekKey }, { category: catFile, app: appFile })
          : await postsApi.update(editId, values, { category: catFile, app: appFile });
      await qc.invalidateQueries({ queryKey: ['posts'] });
      await qc.invalidateQueries({ queryKey: ['me'] });
      navigate(`/posts/${saved.id}`, { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader
        title={editId === null ? '폰프리 주간 리포트' : '리포트 고치기'}
        description="캡처는 확인용이에요. 숫자는 화면을 보고 직접 적어요."
      />

      {existing?.rejectReason && existing.status === 'rejected' && (
        <p className="mb-3 rounded-md bg-danger-50 px-3 py-2 text-base text-danger-600">
          선생님 말씀: {existing.rejectReason}
        </p>
      )}

      <form onSubmit={(e) => submit(e)} className="space-y-4" noValidate>
        {editId === null && ctx && (
          <Card title="어느 주 리포트인가요?">
            <div className="flex gap-2">
              {[ctx.previousWeekKey, ctx.currentWeekKey].map((wk) => (
                <Button
                  key={wk}
                  type="button"
                  variant={weekKey === wk ? 'primary' : 'secondary'}
                  onClick={() => setWeekKey(wk)}
                >
                  {wk === ctx?.currentWeekKey ? '이번 주' : '지난주'}{' '}
                  <span className="ml-1 text-base opacity-80">{wk}</span>
                </Button>
              ))}
            </div>
            {existingForWeek && (
              <p className="mt-2 text-base text-warn-600">
                이 주차 리포트는 이미 있어요.{' '}
                <Link to={`/posts/${existingForWeek.postId}`} className="underline">
                  그 글 보기
                </Link>
              </p>
            )}
          </Card>
        )}

        <Card title="리포트 종류">
          <div className="flex gap-2">
            <Button
              type="button"
              variant={type === 'report' ? 'primary' : 'secondary'}
              disabled={!canUseCapture || editId !== null}
              onClick={() => setType('report')}
            >
              📱 캡처 리포트
            </Button>
            <Button
              type="button"
              variant={type === 'diary' ? 'primary' : 'secondary'}
              disabled={editId !== null}
              onClick={() => setType('diary')}
            >
              📔 폰 없는 일주일 일기
            </Button>
          </div>
          {!canUseCapture && editId === null && (
            <p className="mt-2 text-base text-ink-muted">
              캡처 리포트는 학부모님 동의가 있어야 해요. 지금은 일기로 써요.
            </p>
          )}
        </Card>

        {type === 'report' && (
          <>
            <CaptureGuide defaultOpen={editId === null} />
            <Card title="캡처 2장">
              <div className="grid gap-4 sm:grid-cols-2">
                <ImagePicker
                  label="㉠ 하루 평균 사용시간 화면"
                  hint="이름·알림이 보이면 안 돼요"
                  existingUrl={existingImage('category_capture')}
                  file={catFile}
                  error={fileErr.cat}
                  onChange={(f, err) => {
                    setCatFile(f);
                    setFileErr((s) => ({ ...s, cat: err }));
                  }}
                />
                <ImagePicker
                  label="㉡ 많이 쓴 앱 순위 화면"
                  existingUrl={existingImage('app_capture')}
                  file={appFile}
                  error={fileErr.app}
                  onChange={(f, err) => {
                    setAppFile(f);
                    setFileErr((s) => ({ ...s, app: err }));
                  }}
                />
              </div>
            </Card>
          </>
        )}

        <Card title={type === 'report' ? '캡처를 보고 적어요' : '사용시간 (적을 수 있으면)'}>
          <div className="space-y-3">
            <div>
              <p className="mb-1 text-base font-semibold">하루 평균 사용시간</p>
              <div className="flex items-end gap-2">
                <Input
                  label="시간"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={24}
                  value={hours}
                  onChange={(e) => setHours(e.target.value)}
                  className="w-24"
                />
                <Input
                  label="분"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={59}
                  value={minutes}
                  onChange={(e) => setMinutes(e.target.value)}
                  className="w-24"
                />
              </div>
            </div>
            {type === 'report' && (
              <>
                <div>
                  <p className="mb-1 text-base font-semibold">가장 많이 쓴 종류</p>
                  <div className="flex flex-wrap gap-2">
                    {categories.map((c) => (
                      <button
                        key={c}
                        type="button"
                        aria-pressed={topCategory === c}
                        onClick={() => setTopCategory(c)}
                        className={cn(
                          'min-h-tap rounded-full border-2 px-4 text-base font-semibold',
                          topCategory === c
                            ? 'border-primary-600 bg-primary-600 text-white'
                            : 'border-line-strong bg-surface',
                        )}
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                </div>
                <Input
                  label="가장 많이 쓴 앱"
                  value={topApp}
                  onChange={(e) => setTopApp(e.target.value)}
                  placeholder="예: 유튜브"
                  maxLength={limits.topAppMax}
                />
              </>
            )}
          </div>
        </Card>

        {prevGoal && (
          <Card title="지난주 목표는 어땠나요?">
            <p className="mb-2 text-base">🎯 {prevGoal}</p>
            <div className="mb-2 flex gap-2">
              <Button
                type="button"
                variant={goalAchieved === true ? 'primary' : 'secondary'}
                onClick={() => setGoalAchieved(true)}
              >
                달성했어요
              </Button>
              <Button
                type="button"
                variant={goalAchieved === false ? 'primary' : 'secondary'}
                onClick={() => setGoalAchieved(false)}
              >
                못했어요
              </Button>
            </div>
            {goalAchieved !== null && (
              <Input
                label="한 줄 이유"
                value={goalReason}
                onChange={(e) => setGoalReason(e.target.value)}
                maxLength={limits.goalReasonMax}
              />
            )}
          </Card>
        )}

        <PoliteNotice />
        <Card title="이번 주 나의 폰 습관">
          <div className="mb-2 flex flex-wrap gap-2">
            {HELPERS.map((h) => (
              <button
                key={h}
                type="button"
                onClick={() => setBody((b) => (b ? `${b}\n${h}` : h))}
                className="min-h-tap rounded-md bg-primary-50 px-3 text-base text-primary-800"
              >
                ✍️ {h.slice(0, 14)}…
              </button>
            ))}
          </div>
          <Textarea
            label="성찰 글"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={7}
            hint={`${bodyLen} / ${limits.bodyMin}자 이상 ${limits.bodyMax}자 이하 · ${POLITE_HINT}`}
          />
          <PoliteWarning text={body} />
          <Input
            label="다음 주 목표 (한 줄)"
            value={goalText}
            onChange={(e) => setGoalText(e.target.value)}
            maxLength={limits.goalMax}
            className="mt-3"
            placeholder="예: 저녁 9시 이후에는 폰 안 보기"
          />
        </Card>

        <Card title="누가 볼 수 있나요?">
          <div className="flex gap-2">
            <Button
              type="button"
              variant={visibility === 'class' ? 'primary' : 'secondary'}
              onClick={() => setVisibility('class')}
            >
              우리 반만
            </Button>
            <Button
              type="button"
              variant={visibility === 'school' ? 'primary' : 'secondary'}
              onClick={() => setVisibility('school')}
            >
              전교
            </Button>
          </div>
        </Card>

        {error && (
          <p
            role="alert"
            className="rounded-md bg-danger-50 px-3 py-2 text-base font-medium text-danger-600"
          >
            {error}
          </p>
        )}
        <div className="space-y-2">
          <Button type="submit" block size="lg" loading={busy} disabled={!!existingForWeek}>
            선생님께 보내기
          </Button>
          <Button
            type="button"
            block
            variant="secondary"
            loading={busy}
            disabled={!!existingForWeek}
            onClick={(e) => submit(e, true)}
          >
            임시 저장
          </Button>
          <p className="text-center text-base text-ink-muted">
            보내면 선생님이 확인한 뒤 게시돼요. <Badge tone="primary">예상 +30P</Badge>
          </p>
        </div>
      </form>
    </>
  );
}
