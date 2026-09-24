import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { CouncilPostInput, CouncilPostType, CouncilPostView } from '@server-types/api';
import { useMemo, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { errorMessage } from '@/api/client';
import { councilApi } from '@/api/council';
import { COUNCIL_TYPE } from '@/components/council/councilLabels';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button, Card, Input, Spinner, Textarea } from '@/components/ui';

const toLocal = (d: Date) => {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

/** 자치회 글 작성·공동 편집 (CNC-01, 02, 05): 임원만 */
export function CouncilFormPage() {
  const { id } = useParams();
  const editId = id ? Number(id) : null;
  const existingQ = useQuery({
    queryKey: ['council', 'post', editId],
    queryFn: () => councilApi.get(editId as number),
    enabled: editId !== null,
  });
  if (editId !== null && !existingQ.data) {
    return (
      <div className="flex justify-center py-16">
        <Spinner size="lg" className="text-accent-600" />
      </div>
    );
  }
  return <CouncilForm key={editId ?? 'new'} editId={editId} existing={existingQ.data ?? null} />;
}

function CouncilForm({
  editId,
  existing,
}: {
  editId: number | null;
  existing: CouncilPostView | null;
}) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [type, setType] = useState<CouncilPostType>(existing?.type ?? 'notice');
  const [title, setTitle] = useState(existing?.title ?? '');
  const [body, setBody] = useState(existing?.body ?? '');
  const [startsAt, setStartsAt] = useState(() =>
    toLocal(existing ? new Date(existing.startsAt) : new Date()),
  );
  const [endsAt, setEndsAt] = useState(() =>
    toLocal(existing ? new Date(existing.endsAt) : new Date(Date.now() + 14 * 86_400_000)),
  );
  const [pinRequested, setPinRequested] = useState(existing?.pinRequested ?? false);
  const [allowComments, setAllowComments] = useState(existing?.allowComments ?? true);
  const [options, setOptions] = useState<string[]>(
    existing?.poll?.options.map((o) => o.label) ?? ['', ''],
  );
  const [showBeforeClose, setShowBeforeClose] = useState(existing?.poll?.showBeforeClose ?? false);
  const [photos, setPhotos] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const previews = useMemo(() => photos.map((p) => URL.createObjectURL(p)), [photos]);
  const bodyLen = Array.from(body.trim()).length;

  const pickPhotos = (files: FileList | null) => {
    if (!files) return;
    const list = [...files].slice(0, 5);
    for (const f of list) {
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(f.type))
        return setError('jpg, png, webp 사진만 올릴 수 있어요.');
      if (f.size > 5 * 1024 * 1024) return setError('사진이 너무 커요. 5MB 이하로 올려 주세요.');
    }
    setError(null);
    setPhotos(list);
  };

  const submit = async (e: FormEvent, asDraft: boolean) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const values: CouncilPostInput = {
        type,
        title: title.trim(),
        body: body.trim(),
        startsAt: new Date(startsAt).toISOString(),
        endsAt: new Date(endsAt).toISOString(),
        pinRequested,
        allowComments,
        pollOptions: type === 'poll' ? options.map((o) => o.trim()).filter(Boolean) : [],
        pollShowBeforeClose: showBeforeClose,
        submit: !asDraft,
      };
      const saved =
        editId === null
          ? await councilApi.create(values, photos)
          : await councilApi.update(editId, values, photos);
      await qc.invalidateQueries({ queryKey: ['council'] });
      navigate(`/council/${saved.id}`, { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader
        title={editId === null ? '자치회 글 쓰기' : '자치회 글 고치기'}
        description="선생님이 확인한 뒤 게시돼요. 다른 임원도 함께 고칠 수 있어요."
      />
      <form onSubmit={(e) => submit(e, false)} className="space-y-4" noValidate>
        <Card title="어떤 글인가요?">
          <div className="grid grid-cols-2 gap-2">
            {(Object.keys(COUNCIL_TYPE) as CouncilPostType[]).map((k) => (
              <Button
                key={k}
                type="button"
                variant={type === k ? 'primary' : 'secondary'}
                onClick={() => setType(k)}
              >
                {COUNCIL_TYPE[k].emoji} {COUNCIL_TYPE[k].label}
              </Button>
            ))}
          </div>
        </Card>
        <Card title="제목과 내용">
          <Input
            label="제목 (2~100자)"
            value={title}
            maxLength={100}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="예: 10월 폰프리 챌린지 같이 해요!"
          />
          <Textarea
            label="내용 (10~2000자)"
            className="mt-3"
            value={body}
            rows={8}
            maxLength={2000}
            hint={`${bodyLen}자`}
            onChange={(e) => setBody(e.target.value)}
          />
        </Card>
        {type === 'poll' && (
          <Card title="투표 선택지 (2~5개)">
            <div className="space-y-2">
              {options.map((o, i) => (
                <div key={i} className="flex gap-2">
                  <Input
                    label={`선택지 ${i + 1}`}
                    className="flex-1"
                    value={o}
                    maxLength={40}
                    onChange={(e) =>
                      setOptions((os) => os.map((x, j) => (j === i ? e.target.value : x)))
                    }
                  />
                  {options.length > 2 && (
                    <Button
                      type="button"
                      variant="ghost"
                      className="self-end"
                      onClick={() => setOptions((os) => os.filter((_, j) => j !== i))}
                    >
                      지우기
                    </Button>
                  )}
                </div>
              ))}
              {options.length < 5 && (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setOptions((os) => [...os, ''])}
                >
                  선택지 추가
                </Button>
              )}
            </div>
            <label className="mt-3 flex min-h-tap items-center gap-2 text-base">
              <input
                type="checkbox"
                className="h-5 w-5"
                checked={showBeforeClose}
                onChange={(e) => setShowBeforeClose(e.target.checked)}
              />
              투표가 끝나기 전에도 결과 보여 주기
            </label>
          </Card>
        )}
        <Card title="사진 (0~5장)">
          {existing && existing.images.length > 0 && photos.length === 0 && (
            <div className="mb-2 flex flex-wrap gap-2">
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
            <div className="mb-2 flex flex-wrap gap-2">
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
        <Card title="게시 기간과 옵션">
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              label="시작"
              type="datetime-local"
              value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
            />
            <Input
              label="끝 (최대 60일)"
              type="datetime-local"
              value={endsAt}
              onChange={(e) => setEndsAt(e.target.value)}
            />
          </div>
          <label className="mt-3 flex min-h-tap items-center gap-2 text-base">
            <input
              type="checkbox"
              className="h-5 w-5"
              checked={pinRequested}
              onChange={(e) => setPinRequested(e.target.checked)}
            />
            홈 상단에 고정해 주세요 (선생님이 정해요)
          </label>
          <label className="flex min-h-tap items-center gap-2 text-base">
            <input
              type="checkbox"
              className="h-5 w-5"
              checked={allowComments}
              onChange={(e) => setAllowComments(e.target.checked)}
            />
            친구들 댓글 받기
          </label>
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
        </div>
      </form>
    </>
  );
}
