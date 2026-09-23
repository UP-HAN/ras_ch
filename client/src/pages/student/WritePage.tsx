import { PageHeader } from '@/components/layout/PageHeader';
import { Button, Card } from '@/components/ui';

/** 글쓰기 두 갈래 (PRD 6.1). 작성 폼은 S2(리포트)·S3(기사)에서 */
export function WritePage() {
  return (
    <>
      <PageHeader title="글쓰기" description="무엇을 쓸까요?" />
      <div className="space-y-4">
        <Card title="📱 폰프리 주간 리포트">
          <p className="mb-3 text-base">
            이번 주 내 폰 사용 습관을 돌아봐요. 캡처 2장과 성찰 글을 올려요.
          </p>
          <Button block size="lg">
            리포트 쓰기
          </Button>
        </Card>
        <Card title="📰 RAS 기사">
          <p className="mb-3 text-base">학교에서 겪은 독서·예술·스포츠 활동을 기사로 써요.</p>
          <Button block size="lg" variant="secondary">
            기사 쓰기
          </Button>
        </Card>
      </div>
    </>
  );
}
