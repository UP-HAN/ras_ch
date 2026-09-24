/**
 * 뉴스 토론방 배치 (NWS-04, 05, PRD 11장)
 *  - newsReserve (일 20:00): 다음 주 게시 슬롯마다 예약된 주제가 없으면 은행 ready(오래된 순)에서 예약. ready ≤2 이면 승인 교사에게 알림
 *  - newsPublish (매일 08:00): 마감 지난 live → closed, 시각 지난 scheduled → live. 오늘이 게시일인데 아무것도 없으면 은행에서 바로 게시(안전망)
 *  방학 모드(3차, CMN-06)가 붙으면 두 잡 모두 방학 기간엔 건너뛴다 — 여기서 검사한다.
 */
import { query, tx } from '../db/query.js';
import { logger } from '../lib/logger.js';
import { closeAtOf, nextWeekSlots, todaySlot } from '../lib/newsRules.js';
import { notify } from '../lib/notify.js';
import { kst, toDbDateTime, type DateInput } from '../lib/time.js';
import * as newsRepo from '../repos/newsRepo.js';
import { newsSetting } from '../services/NewsService.js';
import { setJobHandler } from './index.js';

async function notifyApproversLow(ready: number): Promise<void> {
  const approvers = await query<{ id: number }>(
    "SELECT id FROM users WHERE status = 'active' AND (role = 'admin' OR (role = 'teacher' AND is_approver = 1))",
  );
  for (const a of approvers) {
    await notify(a.id, 'news_bank_low', {
      message: `토론 주제 은행에 바로 쓸 수 있는 주제가 ${ready}개 남았어요. 대기 주제를 "바로 사용"으로 올려 주세요.`,
      link: '/teacher/news',
    });
  }
}

/** 은행 ready 하나를 꺼내 주제로 만든다(예약 또는 즉시 게시). 없으면 null */
async function takeFromBank(publishAt: DateInput, live: boolean): Promise<number | null> {
  const setting = await newsSetting();
  return tx(async (conn) => {
    const b = await newsRepo.oldestReady(conn);
    if (!b) return null;
    const id = await newsRepo.insertTopic(
      {
        title: b.title,
        body: b.body,
        type: b.type,
        questions: b.questions,
        tags: b.tags,
        sourceUrl: b.source_url,
        source: 'bank',
        status: live ? 'live' : 'scheduled',
        publishAt: toDbDateTime(publishAt),
        closeAt: live ? toDbDateTime(closeAtOf(publishAt, setting)) : null,
        approvedBy: null,
        bankId: b.id,
      },
      conn,
    );
    await newsRepo.setBankStatus(b.id, 'used', null, id, conn);
    return id;
  });
}

export async function runNewsReserve(
  now: DateInput = new Date(),
): Promise<{ reserved: number; ready: number }> {
  const setting = await newsSetting();
  let reserved = 0;
  for (const slot of nextWeekSlots(now, setting)) {
    if ((await newsRepo.countOnDate(slot.format('YYYY-MM-DD'))) > 0) continue;
    const id = await takeFromBank(slot, false);
    if (id) reserved += 1;
    else logger.warn({ slot: slot.format() }, '주제 은행 ready 가 비어 예약하지 못함');
  }
  const counts = await newsRepo.bankCounts();
  if (counts.ready <= 2) await notifyApproversLow(counts.ready);
  if (reserved > 0) logger.info({ reserved }, '토론 주제 자동 예약');
  return { reserved, ready: counts.ready };
}

export async function runNewsPublish(
  now: DateInput = new Date(),
): Promise<{ published: number; closed: number; fallback: boolean }> {
  const setting = await newsSetting();
  const nowDb = toDbDateTime(now);
  let closed = 0;
  for (const t of await newsRepo.listExpiredLive(nowDb)) {
    await newsRepo.setTopicStatus(t.id, 'closed');
    closed += 1;
  }
  let published = 0;
  for (const t of await newsRepo.listDueScheduled(nowDb)) {
    await newsRepo.setTopicStatus(t.id, 'live', {
      closeAt: toDbDateTime(closeAtOf(t.publish_at ?? now, setting)),
    });
    published += 1;
  }
  // 안전망: 오늘이 게시일이고 게시 시각이 지났는데 오늘 자 주제가 하나도 없으면 은행에서 바로
  let fallback = false;
  const slot = todaySlot(now, setting);
  if (
    slot &&
    !kst(now).isBefore(slot) &&
    (await newsRepo.countOnDate(slot.format('YYYY-MM-DD'))) === 0
  ) {
    const id = await takeFromBank(slot, true);
    if (id) {
      fallback = true;
      published += 1;
      const counts = await newsRepo.bankCounts();
      if (counts.ready <= 2) await notifyApproversLow(counts.ready);
    }
  }
  if (published || closed) logger.info({ published, closed, fallback }, '토론 주제 게시·마감');
  return { published, closed, fallback };
}

export function registerNewsJobs(): void {
  setJobHandler('newsReserve', async () => {
    await runNewsReserve();
  });
  setJobHandler('newsPublish', async () => {
    await runNewsPublish();
  });
}
