import { PageHeader } from '@/components/layout/PageHeader';
import { EmptyState } from '@/components/ui';

/** 아직 만들지 않은 화면의 자리. 스프린트 번호를 적어 두어 어디서 채우는지 알 수 있게 한다 */
export function PlaceholderPage({
  title,
  sprint,
  description,
}: {
  title: string;
  sprint: string;
  description?: string;
}) {
  return (
    <>
      <PageHeader title={title} description={description} />
      <EmptyState
        icon="🚧"
        title="준비 중이에요"
        description={`이 화면은 ${sprint}에서 만들어요.`}
      />
    </>
  );
}
