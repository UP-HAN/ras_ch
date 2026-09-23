import { PageHeader } from '@/components/layout/PageHeader';
import { Button, Card } from '@/components/ui';

/** 내 정보 자리 (PRD 6.1). 포인트·내 글·비밀번호 변경은 S1·S4 */
export function MyPage() {
  return (
    <>
      <PageHeader title="내 정보" />
      <div className="space-y-4">
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
            <Button block variant="secondary">
              비밀번호 바꾸기
            </Button>
            <Button block variant="ghost">
              로그아웃
            </Button>
          </div>
        </Card>
      </div>
    </>
  );
}
