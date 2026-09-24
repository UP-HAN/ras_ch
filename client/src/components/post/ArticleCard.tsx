import type { StudentPostView } from '@server-types/api';
import { Link } from 'react-router-dom';
import { AuthorChip } from '@/components/common/AuthorChip';
import { Badge } from '@/components/ui';
import { tagLabel, typeLabel } from './articleMeta';

/** 기사 목록 카드 (ART-04): 제목·태그·유형·사진 1장·엄지척·댓글 수·기자단 배지 */
export function ArticleCard({ post }: { post: StudentPostView }) {
  const photo = post.images[0];
  return (
    <Link
      to={`/posts/${post.id}`}
      className="block rounded-lg border border-line bg-surface p-4 shadow-card hover:border-primary-300"
    >
      <div className="flex gap-3">
        {photo && (
          <img
            src={photo.url}
            alt=""
            width={photo.width}
            height={photo.height}
            loading="lazy"
            className="h-24 w-24 shrink-0 rounded-md object-cover"
          />
        )}
        <div className="min-w-0 flex-1">
          <h3 className="line-clamp-2 text-lg font-bold">{post.title}</h3>
          <div className="mt-1 flex flex-wrap items-center gap-1">
            {post.article?.tags.map((t) => (
              <Badge key={t} tone="primary">
                {tagLabel(t)}
              </Badge>
            ))}
            {post.article && <Badge tone="neutral">{typeLabel(post.article.articleType)}</Badge>}
          </div>
          <p className="mt-1 text-base text-ink-muted">
            <AuthorChip author={post.author} />
          </p>
          <p className="mt-1 text-base text-ink-muted">
            👍 {post.likeCount} · 💬 {post.commentCount}
          </p>
        </div>
      </div>
    </Link>
  );
}
