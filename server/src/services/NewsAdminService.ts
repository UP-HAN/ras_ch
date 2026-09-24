/**
 * 뉴스 토론방 관리 (NWS-04, 05, ADM): 주제 직접 작성·예약·수정·취소·지금 게시·마감, 주제 은행, 설정, 배치 수동 실행
 * 권한: approver(admin 포함). 라우터에서 requireRole('approver').
 */
import { tx } from '../db/query.js';
import { AppError } from '../lib/apiResponse.js';
import {
  closeAtOf,
  nextWeekSlots,
  slotDays,
  validateTopicInput,
  type NewsScheduleSetting,
} from '../lib/newsRules.js';
import { kst, toDbDateTime } from '../lib/time.js';
import { writeAudit } from '../repos/auditRepo.js';
import * as newsRepo from '../repos/newsRepo.js';
import { setSetting } from '../repos/settingsRepo.js';
import type { AuthUser } from '../types/auth.js';
import type {
  NewsAdminTopicView,
  NewsBankItemView,
  NewsProposalInput,
  NewsSettingsView,
} from '../types/api.js';
import { newsSetting, toCard } from './NewsService.js';

const actorOf = (u: AuthUser, ip?: string) => ({ actorId: u.row.id, ip });

export function toAdminTopic(t: newsRepo.TopicRow): NewsAdminTopicView {
  return {
    ...toCard(t, null),
    body: t.body,
    questions: t.questions,
    sourceUrl: t.source_url,
    source: t.source,
    bankId: t.bank_id,
  };
}

export function toBankItem(b: newsRepo.BankRow): NewsBankItemView {
  return {
    id: b.id,
    title: b.title,
    body: b.body,
    type: b.type,
    questions: b.questions,
    tags: b.tags,
    sourceUrl: b.source_url,
    status: b.status,
    proposedByName: b.proposed_by_name,
    usedTopicId: b.used_topic_id,
    sort: b.sort,
    createdAt: b.created_at.toISOString(),
  };
}

function parsePublishAt(raw: string): string {
  const d = kst(raw);
  if (!d.isValid()) throw AppError.badRequest('게시 시각이 올바르지 않아요.');
  return toDbDateTime(d);
}

// ---------- 주제 ----------

export async function listTopics(from?: string, to?: string): Promise<NewsAdminTopicView[]> {
  const start = from ? kst(from) : kst().startOf('isoWeek').subtract(4, 'week');
  const end = to ? kst(to).add(1, 'day') : kst().startOf('isoWeek').add(3, 'week');
  const rows = await newsRepo.listTopicsBetween(
    start.format('YYYY-MM-DD 00:00:00'),
    end.format('YYYY-MM-DD 00:00:00'),
  );
  return rows.map(toAdminTopic);
}

export async function createTopic(
  user: AuthUser,
  input: NewsProposalInput & { publishAt: string },
  ip?: string,
): Promise<NewsAdminTopicView> {
  const v = validateTopicInput(input);
  if (!v.ok) throw AppError.badRequest(v.message);
  const publishAt = parsePublishAt(input.publishAt);
  const id = await newsRepo.insertTopic({
    ...v.value,
    source: 'manual',
    status: 'scheduled',
    publishAt,
    closeAt: null,
    approvedBy: user.row.id,
    bankId: null,
  });
  await writeAudit({
    ...actorOf(user, ip),
    action: 'news.topic.create',
    targetType: 'news_topic',
    targetId: id,
    payload: { publishAt },
  });
  return toAdminTopic((await newsRepo.findTopic(id)) as newsRepo.TopicRow);
}

export async function updateTopic(
  user: AuthUser,
  id: number,
  input: NewsProposalInput & { publishAt?: string },
  ip?: string,
): Promise<NewsAdminTopicView> {
  const t = await newsRepo.findTopic(id);
  if (!t) throw AppError.notFound('토론 주제를 찾을 수 없어요.');
  if (t.status !== 'scheduled')
    throw AppError.conflict(
      '예약 중인 주제만 고칠 수 있어요. 진행 중이면 마감 후 새로 만들어 주세요.',
    );
  const v = validateTopicInput(input);
  if (!v.ok) throw AppError.badRequest(v.message);
  await newsRepo.updateTopicContent(id, {
    ...v.value,
    publishAt: input.publishAt ? parsePublishAt(input.publishAt) : undefined,
  });
  await writeAudit({
    ...actorOf(user, ip),
    action: 'news.topic.update',
    targetType: 'news_topic',
    targetId: id,
  });
  return toAdminTopic((await newsRepo.findTopic(id)) as newsRepo.TopicRow);
}

export async function cancelTopic(user: AuthUser, id: number, ip?: string): Promise<void> {
  const t = await newsRepo.findTopic(id);
  if (!t) throw AppError.notFound('토론 주제를 찾을 수 없어요.');
  if (t.status !== 'scheduled') throw AppError.conflict('예약 중인 주제만 취소할 수 있어요.');
  await tx(async (conn) => {
    await newsRepo.setTopicStatus(id, 'rejected', {}, conn);
    // 은행에서 온 주제면 다시 ready 로 되돌린다
    if (t.bank_id) await newsRepo.setBankStatus(t.bank_id, 'ready', user.row.id, null, conn);
    await writeAudit(
      { ...actorOf(user, ip), action: 'news.topic.cancel', targetType: 'news_topic', targetId: id },
      conn,
    );
  });
}

export async function publishNow(
  user: AuthUser,
  id: number,
  ip?: string,
): Promise<NewsAdminTopicView> {
  const setting = await newsSetting();
  const t = await newsRepo.findTopic(id);
  if (!t) throw AppError.notFound('토론 주제를 찾을 수 없어요.');
  if (t.status !== 'scheduled') throw AppError.conflict('예약 중인 주제만 바로 게시할 수 있어요.');
  const now = kst();
  await newsRepo.setTopicStatus(id, 'live', {
    publishAt: toDbDateTime(now),
    closeAt: toDbDateTime(closeAtOf(now, setting)),
  });
  await writeAudit({
    ...actorOf(user, ip),
    action: 'news.topic.publish_now',
    targetType: 'news_topic',
    targetId: id,
  });
  return toAdminTopic((await newsRepo.findTopic(id)) as newsRepo.TopicRow);
}

export async function closeNow(
  user: AuthUser,
  id: number,
  ip?: string,
): Promise<NewsAdminTopicView> {
  const t = await newsRepo.findTopic(id);
  if (!t) throw AppError.notFound('토론 주제를 찾을 수 없어요.');
  if (t.status !== 'live') throw AppError.conflict('진행 중인 주제만 마감할 수 있어요.');
  await newsRepo.setTopicStatus(id, 'closed', { closeAt: toDbDateTime(kst()) });
  await writeAudit({
    ...actorOf(user, ip),
    action: 'news.topic.close_now',
    targetType: 'news_topic',
    targetId: id,
  });
  return toAdminTopic((await newsRepo.findTopic(id)) as newsRepo.TopicRow);
}

// ---------- 주제 은행 (NWS-05) ----------

export async function listBank(): Promise<NewsBankItemView[]> {
  return (await newsRepo.listBank()).map(toBankItem);
}

export async function createBank(
  user: AuthUser,
  input: NewsProposalInput & { status?: 'ready' | 'reserve' },
  ip?: string,
): Promise<NewsBankItemView> {
  const v = validateTopicInput(input);
  if (!v.ok) throw AppError.badRequest(v.message);
  const id = await newsRepo.insertBank({
    ...v.value,
    status: input.status ?? 'reserve',
    proposedBy: null,
    reviewedBy: user.row.id,
    sort: 5000,
  });
  await writeAudit({
    ...actorOf(user, ip),
    action: 'news.bank.create',
    targetType: 'news_bank',
    targetId: id,
  });
  return toBankItem((await newsRepo.findBank(id)) as newsRepo.BankRow);
}

export async function updateBank(
  user: AuthUser,
  id: number,
  input: NewsProposalInput,
  ip?: string,
): Promise<NewsBankItemView> {
  const b = await newsRepo.findBank(id);
  if (!b) throw AppError.notFound('주제를 찾을 수 없어요.');
  if (b.status === 'used') throw AppError.conflict('이미 사용한 주제는 고칠 수 없어요.');
  const v = validateTopicInput(input);
  if (!v.ok) throw AppError.badRequest(v.message);
  await newsRepo.updateBank(id, v.value);
  await writeAudit({
    ...actorOf(user, ip),
    action: 'news.bank.update',
    targetType: 'news_bank',
    targetId: id,
  });
  return toBankItem((await newsRepo.findBank(id)) as newsRepo.BankRow);
}

/** pending·reserve → ready / ready → reserve */
export async function setBankStatus(
  user: AuthUser,
  id: number,
  status: 'ready' | 'reserve',
  ip?: string,
): Promise<NewsBankItemView> {
  const b = await newsRepo.findBank(id);
  if (!b) throw AppError.notFound('주제를 찾을 수 없어요.');
  if (b.status === 'used') throw AppError.conflict('이미 사용한 주제예요.');
  await newsRepo.setBankStatus(id, status, user.row.id);
  await writeAudit({
    ...actorOf(user, ip),
    action: `news.bank.${status}`,
    targetType: 'news_bank',
    targetId: id,
  });
  return toBankItem((await newsRepo.findBank(id)) as newsRepo.BankRow);
}

export async function deleteBank(user: AuthUser, id: number, ip?: string): Promise<void> {
  const b = await newsRepo.findBank(id);
  if (!b) throw AppError.notFound('주제를 찾을 수 없어요.');
  if (b.status === 'used') throw AppError.conflict('이미 사용한 주제는 지울 수 없어요.');
  await newsRepo.deleteBank(id);
  await writeAudit({
    ...actorOf(user, ip),
    action: 'news.bank.delete',
    targetType: 'news_bank',
    targetId: id,
  });
}

/** 은행 주제를 특정 시각에 예약 (bank → scheduled, bank used) */
export async function scheduleFromBank(
  user: AuthUser,
  bankId: number,
  publishAtRaw: string,
  ip?: string,
): Promise<NewsAdminTopicView> {
  const publishAt = parsePublishAt(publishAtRaw);
  const id = await tx(async (conn) => {
    const b = await newsRepo.findBank(bankId, conn, true);
    if (!b) throw AppError.notFound('주제를 찾을 수 없어요.');
    if (b.status === 'used') throw AppError.conflict('이미 사용한 주제예요.');
    const topicId = await newsRepo.insertTopic(
      {
        title: b.title,
        body: b.body,
        type: b.type,
        questions: b.questions,
        tags: b.tags,
        sourceUrl: b.source_url,
        source: 'bank',
        status: 'scheduled',
        publishAt,
        closeAt: null,
        approvedBy: user.row.id,
        bankId: b.id,
      },
      conn,
    );
    await newsRepo.setBankStatus(b.id, 'used', user.row.id, topicId, conn);
    await writeAudit(
      {
        ...actorOf(user, ip),
        action: 'news.bank.schedule',
        targetType: 'news_topic',
        targetId: topicId,
        payload: { bankId, publishAt },
      },
      conn,
    );
    return topicId;
  });
  return toAdminTopic((await newsRepo.findTopic(id)) as newsRepo.TopicRow);
}

// ---------- 설정 ----------

export async function settingsView(): Promise<NewsSettingsView> {
  const s = await newsSetting();
  const counts = await newsRepo.bankCounts();
  const slots = nextWeekSlots(new Date(), s);
  const rows = await newsRepo.listTopicsBetween(
    slots[0]?.startOf('day').format('YYYY-MM-DD HH:mm:ss') ?? '2000-01-01',
    slots[slots.length - 1]?.endOf('day').format('YYYY-MM-DD HH:mm:ss') ?? '2000-01-01',
  );
  return {
    ...s,
    slotDays: slotDays(s.perWeek),
    bank: counts,
    nextWeek: slots.map((d) => {
      const hit = rows.find(
        (t) =>
          t.status !== 'rejected' &&
          t.publish_at &&
          kst(t.publish_at).format('YYYY-MM-DD') === d.format('YYYY-MM-DD'),
      );
      return { publishAt: d.toISOString(), topicId: hit?.id ?? null, title: hit?.title ?? null };
    }),
  };
}

export async function updateSettings(
  user: AuthUser,
  input: Partial<NewsScheduleSetting>,
  ip?: string,
): Promise<NewsSettingsView> {
  const cur = await newsSetting();
  const next: NewsScheduleSetting = { ...cur, ...input };
  if (![1, 2, 3].includes(next.perWeek)) throw AppError.badRequest('주당 게시 수는 1~3 이에요.');
  if (!Number.isInteger(next.hour) || next.hour < 0 || next.hour > 23)
    throw AppError.badRequest('게시 시각은 0~23시예요.');
  if (!Number.isInteger(next.durationDays) || next.durationDays < 1 || next.durationDays > 14)
    throw AppError.badRequest('토론 기간은 1~14일이에요.');
  if (!Number.isInteger(next.bestPerGrade) || next.bestPerGrade < 1 || next.bestPerGrade > 5)
    throw AppError.badRequest('베스트 의견은 학년별 1~5개예요.');
  if (
    !Number.isInteger(next.commentsPerTopic) ||
    next.commentsPerTopic < 1 ||
    next.commentsPerTopic > 10
  )
    throw AppError.badRequest('주제당 댓글 수는 1~10이에요.');
  await setSetting('news_schedule', next, user.row.id);
  await writeAudit({
    ...actorOf(user, ip),
    action: 'news.settings.update',
    targetType: 'settings',
    payload: { ...next },
  });
  return settingsView();
}
