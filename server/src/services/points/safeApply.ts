/**
 * 지급·회수 훅. S4 부터 LedgerPointService 가 주입되어 실제로 원장에 기록한다.
 * 훅 호출부(승인·좋아요·댓글·출석·읽기·검토)는 이 두 함수만 사용한다.
 */
import type { PoolConnection } from 'mysql2/promise';
import { getPointService } from './PointService.js';
import type { LedgerResult, PointEvent, ReverseOptions, ReverseResult } from './types.js';

export function applyPointsSafe(event: PointEvent, conn?: PoolConnection): Promise<LedgerResult> {
  return getPointService().apply(event, conn);
}

export function reversePointsSafe(
  refType: string,
  refId: number,
  opts: ReverseOptions,
  conn?: PoolConnection,
): Promise<ReverseResult> {
  return getPointService().reverse(refType, refId, opts, conn);
}
