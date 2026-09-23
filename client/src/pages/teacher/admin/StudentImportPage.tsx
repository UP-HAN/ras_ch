import type { ImportResult } from '@server-types/api';
import { useState } from 'react';
import { adminApi } from '@/api/admin';
import { ApiError, errorMessage } from '@/api/client';
import { PageHeader } from '@/components/layout/PageHeader';
import { Badge, Button, Card } from '@/components/ui';

const HEADER = '학년,반,번호,이름,초기비밀번호,학부모동의,기자단';

/** AUTH-03 학생 CSV 일괄 등록: 파일 선택 → 미리보기(dry run) → 등록 → 결과·초기 비밀번호 */
export function StudentImportPage() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportResult | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (dryRun: boolean) => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const r = await adminApi.importStudents(file, dryRun);
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

  const shown = result ?? preview;

  return (
    <>
      <PageHeader
        title="학생 CSV 등록"
        description="엑셀에서 CSV로 저장한 파일을 올리면 계정을 한꺼번에 만들거나 갱신해요."
      />
      <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
        <Card title="1. 파일 올리기">
          <p className="mb-2 text-base">첫 줄(열 이름)은 아래와 같아야 해요.</p>
          <code className="block rounded bg-primary-50 p-2 text-base">{HEADER}</code>
          <ul className="mt-2 list-disc pl-5 text-base text-ink-muted">
            <li>학년은 3~6, 학부모동의·기자단은 Y 또는 N</li>
            <li>초기비밀번호를 비우면 자동으로 만들어요(4자리 숫자+이름 첫 글자)</li>
            <li>같은 학년·반·번호가 이미 있으면 이름·동의·기자단만 갱신돼요</li>
          </ul>
          <input
            type="file"
            accept=".csv,text/csv"
            aria-label="CSV 파일"
            className="mt-3 block w-full text-base"
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              setPreview(null);
              setResult(null);
              setError(null);
            }}
          />
          <div className="mt-3 flex gap-2">
            <Button variant="secondary" disabled={!file} loading={busy} onClick={() => run(true)}>
              미리보기
            </Button>
            <Button
              disabled={!preview || preview.errors.length > 0}
              loading={busy}
              onClick={() => run(false)}
            >
              등록하기
            </Button>
          </div>
          {error && (
            <p role="alert" className="mt-2 text-base font-medium text-danger-600">
              {error}
            </p>
          )}
        </Card>

        <Card title={result ? '3. 등록 결과' : '2. 미리보기'}>
          {!shown && (
            <p className="text-base text-ink-muted">
              파일을 고르고 미리보기를 누르면 여기에 나와요.
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
                  <table className="w-full text-left text-base">
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
              )}
            </>
          )}
        </Card>
      </div>
    </>
  );
}
