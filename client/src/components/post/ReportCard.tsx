import type { StudentPostView } from '@server-types/api';
import { Link } from 'react-router-dom';
import { AuthorChip } from '@/components/common/AuthorChip';
import { Badge } from '@/components/ui';
import { minutesLabel, UsageDiff } from './UsageDiff';

/** 목록 카드 (RPT-07): 마스킹 이름·반, 주차, 사용시간·변화, 성찰글 앞부분 */
export function ReportCard({ post }: { post: StudentPostView }) {
  const r = post.report;
  return (
    <Link
      to={`/posts/${post.id}`}
      className="block rounded-lg border border-line bg-surface p-4 shadow-card hover:border-primary-300"
    >
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <AuthorChip author={post.author} />
        <span className="text-base text-ink-muted">{post.weekKey}</span>
        {post.type === 'diary' && <Badge tone="neutral">일기형</Badge>}
      </div>
      {r && (
        <div className="mb-2 flex flex-wrap items-center gap-2 text-base">
          <span>하루 평균 {minutesLabel(r.avgMinutesPerDay)}</span>
          <UsageDiff avg={r.avgMinutesPerDay} prev={r.prevAvgMinutes} diff={r.diffMinutes} />
        </div>
      )}
      <p className="line-clamp-3 text-base">{post.body}</p>
      <p className="mt-2 text-base text-ink-muted">🎯 {post.goalText}</p>
    </Link>
  );
}
