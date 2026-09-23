/**
 * PointService 스텁 — S4(4-1)에서 LedgerPointService 로 교체한다.
 * 그때까지 호출하는 코드는 이 계약(types.ts)만 의존한다.
 */
import { AppError } from '../../lib/apiResponse.js';
import type {
  LedgerResult,
  PointEvent,
  PointService,
  ReverseOptions,
  ReverseResult,
} from './types.js';

export class NotImplementedPointService implements PointService {
  apply(_event: PointEvent): Promise<LedgerResult> {
    return Promise.reject(AppError.notImplemented('포인트 지급은 아직 준비 중이에요. (S4 4-1)'));
  }

  reverse(_refType: string, _refId: number, _opts: ReverseOptions): Promise<ReverseResult> {
    return Promise.reject(AppError.notImplemented('포인트 회수는 아직 준비 중이에요. (S4 4-2)'));
  }
}

let instance: PointService = new NotImplementedPointService();

export function getPointService(): PointService {
  return instance;
}

/** 테스트·S4 구현체 주입용 */
export function setPointService(service: PointService): void {
  instance = service;
}
