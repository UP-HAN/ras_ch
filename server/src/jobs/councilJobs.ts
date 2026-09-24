/**
 * 자치회 글 만료 배치 (CNC-07): 매일 00:10, 게시 기간이 끝난 승인 글 → expired, 고정 해제. 멱등
 */
import { logger } from '../lib/logger.js';
import * as councilRepo from '../repos/councilRepo.js';
import { setJobHandler } from './index.js';

export async function runCouncilExpire(): Promise<number> {
  const n = await councilRepo.expireEnded();
  logger.info({ expired: n }, '자치회 글 만료');
  return n;
}

export function registerCouncilJobs(): void {
  setJobHandler('councilExpire', async () => {
    await runCouncilExpire();
  });
}
