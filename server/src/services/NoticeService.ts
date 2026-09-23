/**
 * 공지 (ADM-04) + 안내 문구 편집 (ADM-07)
 */
import { AppError } from '../lib/apiResponse.js';
import { writeAudit } from '../repos/auditRepo.js';
import * as noticeRepo from '../repos/noticeRepo.js';
import { getSetting, setSetting } from '../repos/settingsRepo.js';
import type { NoticeView, TextsView } from '../types/api.js';

interface Actor {
  id: number;
  ip?: string;
}

export function toNoticeView(n: noticeRepo.NoticeRow): NoticeView {
  return {
    id: n.id,
    title: n.title,
    body: n.body,
    startsAt: n.starts_at.toISOString(),
    endsAt: n.ends_at.toISOString(),
    isActive: n.is_active === 1,
    authorName: n.author_name,
  };
}

export async function activeNotices(): Promise<NoticeView[]> {
  return (await noticeRepo.listActive(3)).map(toNoticeView);
}

export async function listNotices(): Promise<NoticeView[]> {
  return (await noticeRepo.listAll()).map(toNoticeView);
}

const DT_RE = /^\d{4}-\d{2}-\d{2}(T| )\d{2}:\d{2}/;

function validate(n: noticeRepo.NoticeInput): noticeRepo.NoticeInput {
  const title = n.title.trim();
  const body = n.body.trim();
  if (title.length < 2 || title.length > 100)
    throw AppError.badRequest('제목을 2~100자로 적어 주세요.');
  if (body.length < 2 || body.length > 2000)
    throw AppError.badRequest('내용을 2~2000자로 적어 주세요.');
  if (!DT_RE.test(n.startsAt) || !DT_RE.test(n.endsAt))
    throw AppError.badRequest('게시 기간을 날짜와 시간으로 적어 주세요.');
  const startsAt = n.startsAt.replace('T', ' ').slice(0, 16) + ':00';
  const endsAt = n.endsAt.replace('T', ' ').slice(0, 16) + ':00';
  if (endsAt <= startsAt) throw AppError.badRequest('종료가 시작보다 빠를 수 없어요.');
  return { title, body, startsAt, endsAt, isActive: n.isActive };
}

export async function createNotice(actor: Actor, input: noticeRepo.NoticeInput): Promise<number> {
  const id = await noticeRepo.insertNotice(validate(input), actor.id);
  await writeAudit({
    actorId: actor.id,
    action: 'notice.create',
    targetType: 'notice',
    targetId: id,
    ip: actor.ip,
  });
  return id;
}

export async function updateNotice(
  actor: Actor,
  id: number,
  input: noticeRepo.NoticeInput,
): Promise<void> {
  if (!(await noticeRepo.findById(id))) throw AppError.notFound('공지를 찾을 수 없어요.');
  await noticeRepo.updateNotice(id, validate(input));
  await writeAudit({
    actorId: actor.id,
    action: 'notice.update',
    targetType: 'notice',
    targetId: id,
    ip: actor.ip,
  });
}

export async function deleteNotice(actor: Actor, id: number): Promise<void> {
  await noticeRepo.deleteNotice(id);
  await writeAudit({
    actorId: actor.id,
    action: 'notice.delete',
    targetType: 'notice',
    targetId: id,
    ip: actor.ip,
  });
}

// ---------- 안내 문구 (ADM-07) ----------

export async function getTexts(): Promise<TextsView> {
  return {
    captureGuide: await getSetting('capture_guide', {
      android_samsung: '',
      iphone: '',
      warning: '',
    }),
    goodCommentGuide: await getSetting('good_comment_guide', ''),
    reviewGuide: await getSetting('review_guide', ''),
  };
}

export async function updateTexts(actor: Actor, t: TextsView): Promise<TextsView> {
  const clip = (s: string, max: number, label: string) => {
    const v = s.trim();
    if (v.length > max) throw AppError.badRequest(`${label}은(는) ${max}자 이하로 적어 주세요.`);
    return v;
  };
  await setSetting(
    'capture_guide',
    {
      android_samsung: clip(t.captureGuide.android_samsung, 500, '갤럭시 안내'),
      iphone: clip(t.captureGuide.iphone, 500, '아이폰 안내'),
      warning: clip(t.captureGuide.warning, 300, '주의 문구'),
    },
    actor.id,
  );
  await setSetting('good_comment_guide', clip(t.goodCommentGuide, 300, '좋은 댓글 기준'), actor.id);
  await setSetting('review_guide', clip(t.reviewGuide, 500, '검토 안내'), actor.id);
  await writeAudit({
    actorId: actor.id,
    action: 'texts.update',
    targetType: 'settings',
    ip: actor.ip,
  });
  return getTexts();
}
