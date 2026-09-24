import type { CouncilPostCard } from '@server-types/api';
import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui';
import { cn } from '@/lib/cn';
import { COUNCIL_STATUS, COUNCIL_TYPE } from './councilLabels';

const dateLabel = (iso: string) =>
  new Date(iso).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' });

/** 자치회 글 카드 (목록·홈 고정 배너) */
export function CouncilCard({
  post,
  banner = false,
  showStatus = false,
}: {
  post: CouncilPostCard;
  banner?: boolean;
  showStatus?: boolean;
}) {
  const t = COUNCIL_TYPE[post.type];
  return (
    <Link
      to={`/council/${post.id}`}
      data-testid={banner ? 'council-banner' : `council-card-${post.id}`}
      className={cn(
        'block rounded-lg border p-4 shadow-card',
        banner
          ? 'border-accent-200 bg-accent-50 hover:bg-accent-100'
          : 'border-line bg-surface hover:border-primary-300',
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={post.type === 'poll' ? 'primary' : 'info'}>
          {t.emoji} {t.label}
        </Badge>
        {post.isPinned && <Badge tone="warn">📌 고정</Badge>}
        {showStatus && (
          <Badge tone={COUNCIL_STATUS[post.status]?.tone ?? 'neutral'}>
            {COUNCIL_STATUS[post.status]?.label ?? post.status}
          </Badge>
        )}
        <span className="ml-auto text-base text-ink-muted">
          {dateLabel(post.startsAt)} ~ {dateLabel(post.endsAt)}
        </span>
      </div>
      <div className="mt-2 flex gap-3">
        {post.thumbnail && !banner && (
          <img
            src={post.thumbnail.url}
            alt=""
            width={post.thumbnail.width}
            height={post.thumbnail.height}
            loading="lazy"
            className="h-20 w-20 shrink-0 rounded-md object-cover"
          />
        )}
        <div className="min-w-0 flex-1">
          <p className={cn('font-extrabold', banner ? 'text-xl' : 'text-lg')}>{post.title}</p>
          <p className="mt-1 text-base text-ink-muted">{post.authorLabel}</p>
          {!banner && (
            <p className="mt-1 text-base text-ink-muted">
              👍 {post.likeCount} · 💬 {post.commentCount}
            </p>
          )}
        </div>
      </div>
    </Link>
  );
}
