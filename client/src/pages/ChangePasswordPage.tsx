import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { authApi } from '@/api/auth';
import { errorMessage } from '@/api/client';
import { Button, Card, Input } from '@/components/ui';
import { isTeacherRole, useMe, useMeCache } from '@/hooks/useMe';

/** AUTH-02 첫 로그인 강제 변경 + 일반 변경. 학생 4자, 교사 8자 이상 */
export function ChangePasswordPage() {
  const { me, isLoading } = useMe();
  const cache = useMeCache();
  const navigate = useNavigate();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (isLoading) return null;
  if (!me) return <Navigate to="/login" replace />;
  const min = isTeacherRole(me) ? 8 : 4;
  const forced = me.mustChangePw;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (next.length < min) return setError(`새 비밀번호는 ${min}자 이상이어야 해요.`);
    if (next !== again) return setError('새 비밀번호를 두 번 똑같이 적어 주세요.');
    setBusy(true);
    try {
      await authApi.changePassword(current, next);
      cache.set({ ...me, mustChangePw: false });
      navigate(isTeacherRole(me) ? '/teacher' : '/', { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[420px] flex-col justify-center px-4 py-8">
      <Card title={forced ? '새 비밀번호를 정해요' : '비밀번호 바꾸기'}>
        {forced && (
          <p className="mb-4 text-base">
            처음 로그인했어요. 나만 아는 새 비밀번호로 바꿔야 다음으로 갈 수 있어요.
          </p>
        )}
        <form onSubmit={submit} className="space-y-4" noValidate>
          <Input
            label={forced ? '지금 받은 비밀번호' : '지금 쓰는 비밀번호'}
            type="password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            autoComplete="current-password"
          />
          <Input
            label="새 비밀번호"
            type="password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            hint={`${min}자 이상, 띄어쓰기 없이`}
            autoComplete="new-password"
          />
          <Input
            label="새 비밀번호 한 번 더"
            type="password"
            value={again}
            onChange={(e) => setAgain(e.target.value)}
            autoComplete="new-password"
            error={error ?? undefined}
          />
          <Button type="submit" block size="lg" loading={busy}>
            바꾸기
          </Button>
          {!forced && (
            <Button type="button" block variant="ghost" onClick={() => navigate(-1)}>
              취소
            </Button>
          )}
        </form>
      </Card>
    </div>
  );
}
