import type { ImportResult } from '@server-types/api';
import { useRef, useState } from 'react';
import { adminApi } from '@/api/admin';
import { ApiError, errorMessage } from '@/api/client';
import { PageHeader } from '@/components/layout/PageHeader';
import { Badge, Button, Card } from '@/components/ui';

/**
 * AUTH-03 학생 CSV 일괄 등록: 양식 받기 → 파일 올리기(고르면 바로 미리보기) → 등록 → 결과·초기 비밀번호
 * 양식의 열 이름에 괄호로 설명을 넣는다. 서버 파서가 괄호 부분을 지우고 읽으므로
 * (StudentImportService 의 normalizedHeader) 선생님은 받은 파일을 그대로 채워서 올리면 된다.
 */
const TEMPLATE_HEADER =
  '학년(3-6),반(숫자),번호(출석번호),이름,초기비밀번호(비우면 자동),학부모동의(Y 또는 N),기자단(Y 또는 N)';
const TEMPLATE_FILENAME = '학생등록양식.csv';

/** 엑셀이 한글을 깨뜨리지 않도록 BOM 을 붙인다 */
function downloadTemplate() {
  const blob = new Blob(['\ufeff' + TEMPLATE_HEADER + '\r\n'], {
    type: 'text/csv;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = TEMPLATE_FILENAME;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function StudentImportPage() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportResult | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const run = async (target: File, dryRun: boolean) => {
    setBusy(true);
    setError(null);
    try {
      const r = await adminApi.importStudents(target, dryRun);
      if (dryRun) setPreview(r);
      else {
        setResult(r);
        setPreview(null);
      }
    } catch (e) {
      if (e instanceof ApiError && e.code === 'CSV_INVALID') {
        setPreview(e.details as ImportResult);
        setError(e.message);
      } else setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  /** 파일을 고르면 바로 미리보기까지 해 준다 (고른 뒤 무엇을 눌러야 하는지 헷갈리지 않도록) */
  const pick = (f: File | null) => {
    setFile(f);
    setPreview(null);
    setResult(null);
    setError(null);
    if (f) void run(f, true);
  };

  const shown = result ?? preview;
  const hasErrors = (preview?.errors.length ?? 0) > 0;
  const canSubmit = !!file && !!preview && !hasErrors;
  const whyDisabled = !file
    ? '먼저 채운 파일을 올려 주세요.'
    : busy
      ? '파일을 확인하고 있어요.'
      : hasErrors
        ? '빨간 글씨로 표시된 줄을 고친 뒤 다시 올려 주세요.'
        : null;

  return (
    <>
      <PageHeader
        title="학생 CSV 등록"
        description="양식을 받아 채운 뒤 올리면 계정을 한꺼번에 만들거나 갱신해요."
      />
      <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
        <div className="space-y-4">
          <Card title="1. 양식 받기">
            <Button block variant="secondary" onClick={downloadTemplate}>
              ⬇ 양식 다운받기 (CSV)
            </Button>
            <p className="mt-2 text-base text-ink-muted">
              받은 파일의 <b>첫 줄은 그대로 두고</b>, 둘째 줄부터 학생을 한 줄씩 적어 저장해 주세요.
            </p>
          </Card>

          <Card title="2. 채운 파일 올리기">
            <input
              ref={fileInput}
              id="student-csv"
              type="file"
              accept=".csv,text/csv,application/vnd.ms-excel,text/plain"
              className="peer sr-only"
              onChange={(e) => pick(e.target.files?.[0] ?? null)}
            />
            <div className="flex flex-wrap items-center gap-2">
              <label
                htmlFor="student-csv"
                className="inline-flex min-h-tap cursor-pointer items-center rounded-md border-2 border-primary-300 bg-surface px-3 text-base font-semibold text-primary-700 hover:bg-primary-50 peer-focus-visible:border-info-600"
              >
                파일 고르기
              </label>
              <span className="min-w-0 break-all text-base text-ink-muted">
                {file ? file.name : '고른 파일이 없어요.'}
              </span>
            </div>
            {file && (
              <Button
                className="mt-2"
                variant="ghost"
                loading={busy}
                onClick={() => {
                  if (fileInput.current) fileInput.current.value = '';
                  void run(file, true);
                }}
              >
                다시 확인하기
              </Button>
            )}
            {error && (
              <p role="alert" className="mt-2 text-base font-medium text-danger-600">
                {error}
              </p>
            )}
          </Card>

          <Card title="3. 등록하기">
            <Button
              block
              disabled={!canSubmit}
              loading={busy}
              onClick={() => file && run(file, false)}
            >
              등록하기
            </Button>
            {whyDisabled ? (
              <p className="mt-2 text-base text-ink-muted">{whyDisabled}</p>
            ) : (
              <p className="mt-2 text-base text-ink-muted">
                오른쪽 미리보기를 확인하고 눌러 주세요. 이미 있는 학생은 이름·동의·기자단만
                갱신돼요.
              </p>
            )}
          </Card>
        </div>

        <Card title={result ? '등록 결과' : '미리보기'}>
          {!shown && (
            <p className="text-base text-ink-muted">
              양식을 받아 채운 뒤 파일을 고르면 여기에 미리보기가 나와요.
            </p>
          )}
          {shown && (
            <>
              <div className="mb-3 flex flex-wrap gap-2">
                <Badge tone="success">신규 {shown.created}</Badge>
                <Badge tone="info">갱신 {shown.updated}</Badge>
                {shown.createdClasses.length > 0 && (
                  <Badge tone="warn">새 반 {shown.createdClasses.join(', ')}</Badge>
                )}
                {shown.errors.length > 0 && (
                  <Badge tone="danger">오류 {shown.errors.length}줄</Badge>
                )}
                {shown.errors.length > 0 && shown.rows.length > 0 && (
                  <span className="text-base text-ink-muted">
                    정상 {shown.rows.length}줄은 오류 줄을 고친 뒤 함께 등록돼요.
                  </span>
                )}
                {result && <Badge tone="primary">등록 완료</Badge>}
              </div>
              {shown.errors.length > 0 && (
                <ul className="mb-3 space-y-1 rounded-md bg-danger-50 p-3 text-base text-danger-600">
                  {shown.errors.map((e) => (
                    <li key={e.line}>
                      {e.line}번째 줄: {e.message}
                    </li>
                  ))}
                </ul>
              )}
              {result && result.rows.some((r) => r.initialPassword) && (
                <p className="mb-2 text-base text-warn-600">
                  초기 비밀번호는 지금만 보여요. 인쇄하거나 적어 두세요.
                </p>
              )}
              {shown.rows.length > 0 && (
                <div className="max-h-[520px] overflow-auto">
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[520px] text-left text-base">
                      <thead>
                        <tr className="border-b border-line text-ink-muted">
                          <th className="py-1 pr-3">줄</th>
                          <th className="py-1 pr-3">반</th>
                          <th className="py-1 pr-3">번호</th>
                          <th className="py-1 pr-3">아이디</th>
                          <th className="py-1 pr-3">처리</th>
                          {result && <th className="py-1">초기 비밀번호</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {shown.rows.map((r) => (
                          <tr key={r.line} className="border-b border-line/60">
                            <td className="py-1 pr-3">{r.line}</td>
                            <td className="py-1 pr-3">{r.className}</td>
                            <td className="py-1 pr-3">{r.studentNo}</td>
                            <td className="py-1 pr-3">{r.loginId}</td>
                            <td className="py-1 pr-3">{r.action === 'create' ? '신규' : '갱신'}</td>
                            {result && (
                              <td className="py-1 font-mono">{r.initialPassword ?? '(유지)'}</td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </Card>
      </div>
    </>
  );
}
