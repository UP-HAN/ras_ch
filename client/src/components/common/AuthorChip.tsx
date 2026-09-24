import type { StudentAuthorView } from '@server-types/api';
import { Badge } from '@/components/ui';
import { cn } from '@/lib/cn';
import { TierBadge } from './TierBadge';

/**
 * 이름 옆 표시 통일 (게이미피케이션): 반 이름 + 등급 배지 + 대표 칭호 + 기자단.
 * 서버가 마스킹한 displayName 만 쓴다(3.1). 검토자 뷰에는 author 가 없으므로 이 컴포넌트가 쓰이지 않는다.
 */
export function AuthorChip({
  author,
  size = 'md',
  className,
}: {
  author: StudentAuthorView;
  size?: 'md' | 'lg';
  className?: string;
}) {
  return (
    <span
      data-testid="author-chip"
      className={cn('inline-flex flex-wrap items-center gap-1.5', className)}
    >
      <span className={cn('font-bold', size === 'lg' ? 'text-lg' : 'text-base')}>
        {author.className} {author.displayName}
      </span>
      <TierBadge tier={author.tier} compact />
      {author.title && (
        <Badge tone="primary" className="px-2 py-0.5" data-testid="title-badge">
          {author.title.emoji} {author.title.label}
        </Badge>
      )}
      {author.isReporter && (
        <Badge tone="info" className="px-2 py-0.5">
          기자단
        </Badge>
      )}
    </span>
  );
}
