import type { StudentPostView } from '@server-types/api';
import { Badge, Card } from '@/components/ui';
import { minutesLabel, UsageDiff } from './UsageDiff';

const KIND_LABEL: Record<string, string> = {
  category_capture: '㉠ 사용시간 화면',
  app_capture: '㉡ 앱 순위 화면',
  photo: '사진',
};

/** 리포트 상세 본문 (학생·교사 공통 표시부). 이미지·수치·성찰글·목표 */
export function ReportDetail({
  post,
  showAuthor = true,
}: {
  post: StudentPostView;
  showAuthor?: boolean;
}) {
  const r = post.report;
  return (
    <div className="space-y-4">
      {showAuthor && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-lg font-bold">
            {post.author.className} {post.author.displayName}
          </span>
          {post.author.isReporter && <Badge tone="info">기자단</Badge>}
          <span className="text-base text-ink-muted">{post.weekKey}</span>
          {post.type === 'diary' && <Badge tone="neutral">폰 없는 일주일 일기</Badge>}
        </div>
      )}

      {post.images.length > 0 && (
        <div className="grid grid-cols-2 gap-2">
          {post.images.map((img) => (
            <figure key={img.id}>
              <img
                src={img.url}
                alt={KIND_LABEL[img.kind] ?? '캡처'}
                width={img.width}
                height={img.height}
                loading="lazy"
                className="w-full rounded-md border border-line object-contain"
              />
              <figcaption className="mt-1 text-center text-base text-ink-muted">
                {KIND_LABEL[img.kind] ?? '캡처'}
              </figcaption>
            </figure>
          ))}
        </div>
      )}

      {r && (
        <Card>
          <dl className="grid grid-cols-2 gap-y-2 text-base">
            <dt className="text-ink-muted">하루 평균</dt>
            <dd className="font-bold">{minutesLabel(r.avgMinutesPerDay)}</dd>
            <dt className="text-ink-muted">지난주 대비</dt>
            <dd>
              <UsageDiff avg={r.avgMinutesPerDay} prev={r.prevAvgMinutes} diff={r.diffMinutes} />
            </dd>
            {r.topCategory && (
              <>
                <dt className="text-ink-muted">많이 쓴 종류</dt>
                <dd>{r.topCategory}</dd>
              </>
            )}
            {r.topApp && (
              <>
                <dt className="text-ink-muted">많이 쓴 앱</dt>
                <dd>{r.topApp}</dd>
              </>
            )}
            {r.goalAchieved !== null && (
              <>
                <dt className="text-ink-muted">지난주 목표</dt>
                <dd>
                  {r.goalAchieved ? '달성했어요 🎉' : '못했어요'}
                  {r.goalReason && <span className="block text-ink-muted">{r.goalReason}</span>}
                </dd>
              </>
            )}
          </dl>
        </Card>
      )}

      <Card title="이번 주 나의 폰 습관">
        <p className="whitespace-pre-wrap text-base leading-relaxed">{post.body}</p>
      </Card>
      <Card tone="primary" title="다음 주 목표">
        <p className="text-lg font-bold">🎯 {post.goalText}</p>
      </Card>
    </div>
  );
}
