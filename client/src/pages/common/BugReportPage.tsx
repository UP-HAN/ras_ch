import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState, type FormEvent } from 'react';
import type { BugReportView, BugStatusView } from '@server-types/api';
import { bugReportsApi } from '@/api/bugReports';
import { errorMessage } from '@/api/client';
import { PoliteWarning } from '@/components/common/PoliteNotice';
import { PageHeader } from '@/components/layout/PageHeader';
import { Badge, Button, Card, EmptyState, Input, Spinner, Textarea } from '@/components/ui';
import { fmtDateTime } from '@/lib/format';
import { useMe } from '@/hooks/useMe';

/**
 * 버그 신고 — 신고자 화면 (BUG-01, BUG-02). 학생·교사가 같이 쓴다.
 * 문구만 다르다: 학생은 "불편한 점 알리기", 교사는 "버그 신고" (2026-10-06 사용자 결정).
 */
const STATUS: Record<
  BugStatusView,
  { label: string; studentLabel: string; tone: 'neutral' | 'info' | 'success' | 'warn' }
> = {
  received: { label: '받음', studentLabel: '보냈어요', tone: 'neutral' },
  checking: { label: '확인 중', studentLabel: '살펴보는 중이에요', tone: 'info' },
  resolved: { label: '해결', studentLabel: '고쳤어요', tone: 'success' },
  held: { label: '보류', studentLabel: '나중에 고칠 거예요', tone: 'warn' },
};

function StatusBadge({ status, student }: { status: BugStatusView; student: boolean }) {
  const s = STATUS[status];
  return <Badge tone={s.tone}>{student ? s.studentLabel : s.label}</Badge>;
}

function ReportItem({ r, student }: { r: BugReportView; student: boolean }) {
  return (
    <li className="rounded-lg border border-line bg-surface p-3">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={r.status} student={student} />
        <span className="font-bold">{r.title}</span>
        <span className="ml-auto text-base text-ink-muted">{fmtDateTime(r.createdAt)}</span>
      </div>
      <p className="mt-1 whitespace-pre-wrap text-base">{r.body}</p>
      {r.imagePath && (
        <img
          src={`/uploads/${r.imagePath}`}
          alt="보내 주신 사진"
          className="mt-2 max-h-60 max-w-full rounded-md border border-line"
        />
      )}
      {r.adminReply && (
        <div className="mt-2 rounded-md bg-primary-50 p-2">
          <p className="text-base font-semibold text-primary-800">선생님 답변</p>
          <p className="mt-0.5 whitespace-pre-wrap text-base">{r.adminReply}</p>
          {r.repliedAt && (
            <p className="mt-1 text-base text-ink-muted">{fmtDateTime(r.repliedAt)}</p>
          )}
        </div>
      )}
    </li>
  );
}

export function BugReportPage() {
  const { me } = useMe();
  const student = me?.role === 'student';
  const qc = useQueryClient();

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [photo, setPhoto] = useState<File | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const photoInput = useRef<HTMLInputElement>(null);

  /** 같은 사진을 다시 고를 수 있도록 input 값까지 비운다 */
  const clearPhoto = () => {
    setPhoto(null);
    if (photoInput.current) photoInput.current.value = '';
  };

  const mine = useQuery({ queryKey: ['bug-reports', 'mine'], queryFn: bugReportsApi.mine });

  const create = useMutation({
    mutationFn: () =>
      bugReportsApi.create({
        title,
        body,
        // 바로 전에 보던 화면을 함께 보낸다 (BUG-01). 서버가 다시 검사한다
        pagePath: typeof document !== 'undefined' ? document.referrer || null : null,
        photo,
      }),
    onSuccess: () => {
      setTitle('');
      setBody('');
      clearPhoto();
      setErr(null);
      setMsg(
        student
          ? '보내 주셔서 고마워요. 선생님이 확인하면 알림으로 알려 드릴게요.'
          : '접수되었습니다. 처리 상태는 아래 목록에서 확인하실 수 있습니다.',
      );
      void qc.invalidateQueries({ queryKey: ['bug-reports', 'mine'] });
    },
    onError: (e) => {
      setMsg(null);
      setErr(errorMessage(e));
    },
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    create.mutate();
  };

  const remaining = mine.data?.remainingToday ?? 0;

  return (
    <>
      <PageHeader
        title={student ? '불편한 점 알리기' : '버그 신고'}
        description={
          student
            ? '앱을 쓰다가 이상한 점이 있으면 알려 주세요. 선생님이 보고 고칠게요.'
            : '오류나 개선할 점을 보내 주세요. 관리자가 상태와 답변을 남깁니다.'
        }
      />
      <div className="space-y-4">
        <Card title={student ? '무엇이 이상했나요?' : '새 신고 보내기'}>
          <form onSubmit={submit} className="space-y-3">
            <Input
              label="제목"
              value={title}
              maxLength={100}
              required
              onChange={(e) => setTitle(e.target.value)}
              placeholder={student ? '예) 글쓰기 단추가 안 눌려요' : '예) 대기함 목록 정렬 오류'}
              hint="무엇이 문제인지 짧게 적어 주세요."
            />
            <Textarea
              label="자세한 내용"
              value={body}
              rows={5}
              maxLength={2000}
              required
              onChange={(e) => setBody(e.target.value)}
              placeholder={
                student
                  ? '어느 화면에서 무엇을 눌렀는지, 어떻게 되었는지 적어 주세요.'
                  : '재현 방법과 기대한 동작을 적어 주시면 빠르게 확인할 수 있습니다.'
              }
              hint={`${Array.from(body).length}/2000자`}
            />
            <PoliteWarning text={body} />
            <div>
              <p className="mb-1 text-base font-semibold">사진 (안 넣어도 괜찮아요)</p>
              {/* 브라우저 기본 파일 단추는 영어로 나올 수 있어 한국어 단추를 직접 만든다 (10장) */}
              <input
                ref={photoInput}
                id="bug-photo"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
                className="peer sr-only"
              />
              <div className="flex flex-wrap items-center gap-2">
                <label
                  htmlFor="bug-photo"
                  className="inline-flex min-h-tap cursor-pointer items-center rounded-md border-2 border-line-strong bg-surface px-3 text-base font-semibold text-ink hover:bg-accent-50 peer-focus-visible:border-info-600"
                >
                  사진 고르기
                </label>
                <span className="min-w-0 break-all text-base text-ink-muted">
                  {photo ? photo.name : '고른 사진이 없어요.'}
                </span>
                {photo && (
                  <button
                    type="button"
                    onClick={clearPhoto}
                    className="min-h-tap rounded-md px-2 text-base font-semibold text-accent-900 hover:bg-accent-100"
                  >
                    빼기
                  </button>
                )}
              </div>
              <p className="mt-1 text-base text-ink-muted">
                화면을 찍은 사진이 있으면 1장까지 올릴 수 있어요. (5MB 이하)
              </p>
              {photo && (
                <img
                  src={URL.createObjectURL(photo)}
                  alt="올릴 사진 미리보기"
                  className="mt-2 max-h-60 max-w-full rounded-md border border-line"
                />
              )}
            </div>
            {err && (
              <p role="alert" className="text-base font-medium text-danger-600">
                {err}
              </p>
            )}
            {msg && <p className="text-base font-medium text-success-600">{msg}</p>}
            <div className="flex flex-wrap items-center gap-2">
              <Button type="submit" disabled={create.isPending || remaining <= 0}>
                {create.isPending ? '보내는 중…' : '보내기'}
              </Button>
              <span className="text-base text-ink-muted">
                {remaining > 0
                  ? `오늘 ${remaining}번 더 보낼 수 있어요.`
                  : '오늘은 더 보낼 수 없어요. 내일 다시 보내 주세요.'}
              </span>
            </div>
          </form>
        </Card>

        <Card title={student ? '내가 보낸 것' : '내 신고'}>
          {mine.isLoading ? (
            <Spinner />
          ) : mine.data && mine.data.reports.length > 0 ? (
            <ul className="space-y-2">
              {mine.data.reports.map((r) => (
                <ReportItem key={r.id} r={r} student={student} />
              ))}
            </ul>
          ) : (
            <EmptyState
              icon="📮"
              title={student ? '아직 보낸 것이 없어요.' : '아직 보낸 신고가 없습니다.'}
              description={
                student
                  ? '이상한 점을 발견하면 위에서 알려 주세요.'
                  : '오류를 발견하시면 위 양식으로 보내 주세요.'
              }
            />
          )}
        </Card>
      </div>
    </>
  );
}
