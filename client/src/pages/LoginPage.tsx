import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { authApi } from '@/api/auth';
import { errorMessage } from '@/api/client';
import { Button, Card, Input } from '@/components/ui';
import { isTeacherRole, useMe, useMeCache } from '@/hooks/useMe';

/** AUTH-01 로그인. 학생은 "265101"(학년도·학년·반·번호), 교사는 이메일 */
export function LoginPage() {
  const { me, isLoading } = useMe();
  const cache = useMeCache();
  const navigate = useNavigate();
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!isLoading && me) return <Navigate to={isTeacherRole(me) ? '/teacher' : '/'} replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const r = await authApi.login(loginId, password);
      cache.set(r.me);
      if (r.mustChangePw) navigate('/change-password', { replace: true });
      else navigate(isTeacherRole(r.me) ? '/teacher' : '/', { replace: true });
    } catch (err) {
      setError(errorMessage(err, '로그인이 안 됐어요. 다시 해 주세요.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[420px] flex-col justify-center px-4 py-8">
      <div className="mb-6 text-center">
        <div className="text-5xl" aria-hidden="true">
          🏮
        </div>
        <h1 className="mt-2 text-2xl font-extrabold text-accent-700">초롱 RAS 포인트</h1>
        <p className="text-base text-ink-muted">폰은 쉬go, 포인트는 쌓이go</p>
      </div>
      <Card>
        <form onSubmit={submit} className="space-y-4" noValidate>
          <Input
            label="아이디"
            value={loginId}
            onChange={(e) => setLoginId(e.target.value)}
            placeholder="예: 265101"
            autoComplete="username"
            autoCapitalize="none"
            required
          />
          <Input
            label="비밀번호"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
            error={error ?? undefined}
          />
          <Button type="submit" block size="lg" loading={busy}>
            로그인
          </Button>
        </form>
        <p className="mt-4 text-base text-ink-muted">
          아이디나 비밀번호를 잊었으면 담임 선생님께 말씀드리세요.
        </p>
      </Card>
    </div>
  );
}
