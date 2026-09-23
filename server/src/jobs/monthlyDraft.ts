/**
 * HOF-02 월간 결산 초안 배치 (매월 1일 00:05): 지난달 초안이 없으면 만든다. 확정된 달은 건드리지 않는다.
 */
import { logger } from '../lib/logger.js';
import { monthKey, previousMonthKey } from '../lib/time.js';
import * as settlementRepo from '../repos/settlementRepo.js';
import { createDraft } from '../services/settlement/draft.js';
import { setJobHandler } from './index.js';

export async function runMonthlyDraft(
  target: string = previousMonthKey(monthKey()),
): Promise<boolean> {
  const existing = await settlementRepo.findByMonth(target);
  if (existing) return false;
  await createDraft(target);
  logger.info({ month: target }, '월간 결산 초안 생성');
  return true;
}

export function registerMonthlyDraft(): void {
  setJobHandler('monthlyDraft', async () => {
    await runMonthlyDraft();
  });
}
