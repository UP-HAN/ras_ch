import { useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button, Card } from '@/components/ui';
import { useMe } from '@/hooks/useMe';

/** 글쓰기 두 갈래 (PRD 6.1): 리포트 / 기사 */
export function WritePage() {
  const navigate = useNavigate();
  const { me } = useMe();
  return (
    <>
      <PageHeader title="글쓰기" description="무엇을 쓸까요?" />
      <div className="space-y-4">
        <Card title="📱 폰프리 주간 리포트">
          <p className="mb-3 text-base">
            이번 주 내 폰 사용 습관을 돌아봐요. 캡처 2장과 성찰 글을 올려요.
          </p>
          <Button block size="lg" onClick={() => navigate('/write/report')}>
            리포트 쓰기
          </Button>
        </Card>
        <Card title="📰 RAS 기사">
          <p className="mb-3 text-base">
            학교에서 겪은 독서·예술·스포츠·폰프리 활동을 기사로 써요. 승인되면 전교에 게시돼요.
          </p>
          <Button block size="lg" variant="secondary" onClick={() => navigate('/write/article')}>
            기사 쓰기
          </Button>
        </Card>
        {me?.isCouncil && (
          <Card title="🏫 학생자치회 글" tone="accent" data-testid="write-council">
            <p className="mb-3 text-base">
              공지·홍보·투표·활동 보고를 올려요. 선생님이 확인하면 전교에 게시돼요. (포인트 없음)
            </p>
            <Button block size="lg" variant="secondary" onClick={() => navigate('/write/council')}>
              자치회 글 쓰기
            </Button>
          </Card>
        )}
      </div>
    </>
  );
}
