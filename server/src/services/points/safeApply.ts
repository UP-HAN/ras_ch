/**
 * S4 4-1 전까지 PointService 가 스텁(NOT_IMPLEMENTED)이므로, 지급·회수 훅은 여기로 감싸서 호출한다.
 * 구현체가 들어오면 이 파일의 catch 분기만 제거하면 된다. TODO(S4 4-1)
 */
import type { PoolConnection } from 'mysql2/promise';
import { AppError } from '../../lib/apiResponse.js';
import { logger } from '../../lib/logger.js';
import { getPointService } from './PointService.js';
import type { LedgerResult, PointEvent, ReverseOptions, ReverseResult } from './types.js';

export async function applyPointsSafe(
  event: PointEvent,
  conn?: PoolConnection,
): Promise<LedgerResult | null> {
  try {
    return await getPointService().apply(event, conn);
  } catch (err) {
    if (err instanceof AppError && err.code === 'NOT_IMPLEMENTED') {
      logger.warn(
        { rule: event.ruleCode, ref: `${event.refType}:${event.refId}` },
        '포인트 엔진 미구현 — 지급 생략',
      );
      return null;
    }
    throw err;
  }
}

export async function reversePointsSafe(
  refType: string,
  refId: number,
  opts: ReverseOptions,
  conn?: PoolConnection,
): Promise<ReverseResult | null> {
  try {
    return await getPointService().reverse(refType, refId, opts, conn);
  } catch (err) {
    if (err instanceof AppError && err.code === 'NOT_IMPLEMENTED') {
      logger.warn({ ref: `${refType}:${refId}` }, '포인트 엔진 미구현 — 회수 생략');
      return null;
    }
    throw err;
  }
}
