import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { MyPostView } from '@server-types/api';
import { useMemo, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { errorMessage } from '@/api/client';
import { postsApi } from '@/api/posts';
import { articlesApi } from '@/api/reactions';
import { PageHeader } from '@/components/layout/PageHeader';
import { ARTICLE_TAGS, ARTICLE_TYPES } from '@/components/post/articleMeta';
import { Badge, Button, Card, Input, Spinner, Textarea } from '@/components/ui';
import { useMe } from '@/hooks/useMe';
import { cn } from '@/lib/cn';

/** 기사 작성·수정 (ART-01, 02, 07) */
export function ArticleFormPage() {
  const { id } = useParams();
  const editId = id ? Number(id) : null;
  const existingQ = useQuery({
    queryKey: ['posts', editId],
    queryFn: () => postsApi.get(editId as number) as Promise<MyPostView>,
    enabled: editId !== null,
  });
  if (editId !== null && !existingQ.data) {
    return (
      <div className="flex justify-center py-16">
        <Spinner size="lg" className="text-primary-600" />
      </div>
    );
  }
  return <ArticleForm key={editId ?? 'new'} editId={editId} existing={existingQ.data ?? null} />;
}

function ArticleForm({ editId, existing }: { editId: number | null; existing: MyPostView | null }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { me } = useMe();
  const [articleType, setArticleType] = useState(existing?.article?.articleType ?? 'review');
  const [title, setTitle] = useState(existing?.title ?? '');
  const [tags, setTags] = useState<string[]>(existing?.article?.tags ?? []);
  const [body, setBody] = useState(existing?.body ?? '');
  const [oneLine, setOneLine] = useState(existing?.article?.oneLine ?? '');
  const [photos, setPhotos] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const type = ARTICLE_TYPES.find((t) => t.key === articleType) ?? ARTICLE_TYPES[2];
  const bodyLen = useMemo(() => Array.from(body.trim()).length, [body]);
  const previews = useMemo(() => photos.map((p) => URL.createObjectURL(p)), [photos]);

  const toggleTag = (k: string) =>
    setTags((s) => (s.includes(k) ? s.filter((x) => x !== k) : [...s, k]));

  const pickPhotos = (files: FileList | null) => {
    if (!files) return;
    const list = [...files].slice(0, 3);
    for (const f of list) {
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(f.type))
        return setError('jpg, png, webp 사진만 올릴 수 있어요.');
      if (f.size > 5 * 1024 * 1024) return setError('사진이 너무 커요. 5MB 이하로 올려 주세요.');
    }
    setError(null);
    setPhotos(list);
  };

  const validate = (): string | null => {
    const t = Array.from(title.trim()).length;
    if (t < 2 || t > 40) return '제목은 2~40자로 써 주세요.';
    if (tags.length === 0) return '영역을 하나 이상 골라 주세요.';
    if (bodyLen < type.minBody)
      return `본문을 ${type.minBody}자 이상 써 주세요. (지금 ${bodyLen}자)`;
    if (bodyLen > 3000) return '본문은 3000자까지만요.';
    if (Array.from(oneLine).length > 100) return '한 줄 소감은 100자까지만요.';
    return null;
  };

  const submit = async (e: FormEvent, asDraft = false) => {
    e.preventDefault();
    const v = validate();
    if (v) return setError(v);
    setBusy(true);
    setError(null);
    try {
      const values = {
        title: title.trim(),
        articleType,
        tags,
        body: body.trim(),
        oneLine: oneLine.trim(),
        submit: !asDraft,
      };
      const saved =
        editId === null
          ? await articlesApi.create(values, photos)
          : await articlesApi.update(editId, values, photos);
      await qc.invalidateQueries({ queryKey: ['posts'] });
      navigate(`/posts/${saved.id}`, { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader
        title={editId === null ? 'RAS 기사 쓰기' : '기사 고치기'}
        description="학교에서 겪은 독서·예술·스포츠·폰프리 이야기를 기사로 써요."
      />
      {me?.isReporter && (
        <p className="mb-3 rounded-md bg-info-50 px-3 py-2 text-base text-info-600">
          <Badge tone="info">기자단</Badge> 기자단 기사는 승인되면 보너스 포인트가 있어요!
        </p>
      )}
      {existing?.status === 'rejected' && existing.rejectReason && (
        <p className="mb-3 rounded-md bg-danger-50 px-3 py-2 text-base text-danger-600">
          선생님 말씀: {existing.rejectReason}
        </p>
      )}
      <form onSubmit={(e) => submit(e)} className="space-y-4" noValidate>
        <Card title="어떤 기사인가요?">
          <div className="grid grid-cols-2 gap-2">
            {ARTICLE_TYPES.map((t) => (
              <Button
                key={t.key}
                type="button"
                variant={articleType === t.key ? 'primary' : 'secondary'}
                onClick={() => setArticleType(t.key)}
              >
                {t.label}
              </Button>
            ))}
          </div>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-base text-ink-muted">
            {type.prompts.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </Card>

        <Card title="제목과 영역">
          <Input
            label="제목"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={40}
            placeholder="예: 토요 스포츠데이 배구 결승전"
          />
          <p className="mb-1 mt-3 text-base font-semibold">영역 (여러 개 가능)</p>
          <div className="flex flex-wrap gap-2">
            {ARTICLE_TAGS.map((t) => (
              <button
                key={t.key}
                type="button"
                aria-pressed={tags.includes(t.key)}
                onClick={() => toggleTag(t.key)}
                className={cn(
                  'min-h-tap rounded-full border-2 px-4 text-base font-semibold',
                  tags.includes(t.key)
                    ? 'border-primary-600 bg-primary-600 text-white'
                    : 'border-line-strong bg-surface',
                )}
              >
                {t.emoji} {t.label}
              </button>
            ))}
          </div>
        </Card>

        <Card title="사진 (0~3장)">
          {existing && existing.images.length > 0 && photos.length === 0 && (
            <div className="mb-2 flex gap-2">
              {existing.images.map((img) => (
                <img
                  key={img.id}
                  src={img.url}
                  alt=""
                  className="h-20 w-20 rounded-md object-cover"
                />
              ))}
            </div>
          )}
          {previews.length > 0 && (
            <div className="mb-2 flex gap-2">
              {previews.map((src) => (
                <img key={src} src={src} alt="" className="h-20 w-20 rounded-md object-cover" />
              ))}
            </div>
          )}
          <label className="flex min-h-tap cursor-pointer items-center justify-center rounded-md bg-primary-100 text-base font-semibold text-primary-800">
            사진 고르기{existing && existing.images.length > 0 ? ' (새로 고르면 모두 바뀜)' : ''}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              className="sr-only"
              onChange={(e) => pickPhotos(e.target.files)}
            />
          </label>
        </Card>

        <Card title="본문">
          <Textarea
            label="기사 내용"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={10}
            hint={`${bodyLen} / ${type.minBody}자 이상 3000자 이하`}
          />
          <Input
            label="한 줄 소감"
            value={oneLine}
            onChange={(e) => setOneLine(e.target.value)}
            maxLength={100}
            className="mt-3"
            placeholder="예: 다음에도 꼭 참여하고 싶어요"
          />
        </Card>

        {error && (
          <p
            role="alert"
            className="rounded-md bg-danger-50 px-3 py-2 text-base font-medium text-danger-600"
          >
            {error}
          </p>
        )}
        <div className="space-y-2">
          <Button type="submit" block size="lg" loading={busy}>
            선생님께 보내기
          </Button>
          <Button
            type="button"
            block
            variant="secondary"
            loading={busy}
            onClick={(e) => submit(e, true)}
          >
            임시 저장
          </Button>
          <p className="text-center text-base text-ink-muted">
            승인되면 전교에 게시돼요. <Badge tone="primary">예상 +30P</Badge>
          </p>
        </div>
      </form>
    </>
  );
}
