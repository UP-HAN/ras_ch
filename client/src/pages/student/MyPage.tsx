import { useNavigate } from 'react-router-dom';
import { authApi } from '@/api/auth';
import { PageHeader } from '@/components/layout/PageHeader';
import { Badge, Button, Card } from '@/components/ui';
import { useMe, useMeCache } from '@/hooks/useMe';

/** 내 정보 (6.1). 포인트 내역은 S4 4-3 */
export function MyPage() {
  const { me } = useMe();
  const cache = useMeCache();
  const navigate = useNavigate();

  const logout = async () => {
    await authApi.logout();
    cache.clear();
    navigate('/login', { replace: true });
  };

  return (
    <>
      <PageHeader title="내 정보" />
      <div className="space-y-4">
        <Card>
          <p className="text-xl font-extrabold">
            {me?.className ? `${me.className} ` : ''}
            {me?.displayName}
          </p>
          <p className="mt-1 text-base text-ink-muted">
            아이디 {me?.loginId} {me?.isCouncil && <Badge tone="info">자치회 임원</Badge>}
          </p>
        </Card>
        <Card title="내 포인트">
          <dl className="grid grid-cols-3 text-center">
            {[
              ['이번 주', '0P'],
              ['이번 달', '0P'],
              ['누적', '0P'],
            ].map(([k, v]) => (
              <div key={k}>
                <dt className="text-base text-ink-muted">{k}</dt>
                <dd className="text-2xl font-extrabold text-primary-700">{v}</dd>
              </div>
            ))}
          </dl>
        </Card>
        <Card title="계정">
          <div className="space-y-2">
            <Button block variant="secondary" onClick={() => navigate('/change-password')}>
              비밀번호 바꾸기
            </Button>
            <Button block variant="ghost" onClick={logout}>
              로그아웃
            </Button>
          </div>
        </Card>
      </div>
    </>
  );
}
