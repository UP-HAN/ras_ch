import type { StudentPostView } from '@server-types/api';
import { AuthorChip } from '@/components/common/AuthorChip';
import { Badge, Card } from '@/components/ui';
import { tagLabel, typeLabel } from './articleMeta';

/** 기사 상세 본문 (ART-01): 제목·태그·유형·사진·본문·한 줄 소감 */
export function ArticleDetail({ post }: { post: StudentPostView }) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-extrabold">{post.title}</h2>
        <div className="mt-2 flex flex-wrap items-center gap-1">
          {post.article?.tags.map((t) => (
            <Badge key={t} tone="primary">
              {tagLabel(t)}
            </Badge>
          ))}
          {post.article && <Badge tone="neutral">{typeLabel(post.article.articleType)}</Badge>}
        </div>
        <p className="mt-2 text-base text-ink-muted">
          <AuthorChip author={post.author} />
          {post.approvedAt && (
            <span className="ml-2">{new Date(post.approvedAt).toLocaleDateString('ko-KR')}</span>
          )}
        </p>
      </div>

      {post.images.length > 0 && (
        <div className="space-y-2">
          {post.images.map((img) => (
            <img
              key={img.id}
              src={img.url}
              alt="기사 사진"
              width={img.width}
              height={img.height}
              loading="lazy"
              className="w-full rounded-md border border-line object-contain"
            />
          ))}
        </div>
      )}

      <Card>
        <p className="whitespace-pre-wrap text-base leading-relaxed">{post.body}</p>
      </Card>
      {post.article?.oneLine && (
        <Card tone="primary" title="한 줄 소감">
          <p className="text-lg font-bold">💬 {post.article.oneLine}</p>
        </Card>
      )}
    </div>
  );
}
