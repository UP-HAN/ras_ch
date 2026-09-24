/**
 * 배치 골격 (PRD 11장, CLAUDE.md). 시각은 Asia/Seoul.
 *  - weeklyTop        : 매주 월요일 00:05  — 주간 TOP 스냅샷 (S5 5-1)
 *  - monthlyDraft     : 매월 1일 00:05     — 월간 결산 초안 (S5 5-2)
 *  - recountCaches    : 매일 03:00         — like_count/comment_count 재검증 (8.1)
 *  - autoEscalate     : 매시 정각          — 48시간 미검토 글 승격 표시 (S4 4-7)
 */
import cron from 'node-cron';
import { logger } from '../lib/logger.js';
import { TZ } from '../lib/time.js';

export type JobName =
  'weeklyTop' | 'monthlyDraft' | 'recountCaches' | 'autoEscalate' | 'newsReserve' | 'newsPublish';

export const SCHEDULES: Record<JobName, string> = {
  weeklyTop: '5 0 * * 1',
  monthlyDraft: '5 0 1 * *',
  recountCaches: '0 3 * * *',
  autoEscalate: '0 * * * *',
  // P2-1 토론 주제: 일 20:00 다음 주 자동 예약, 매일 08:00 게시·마감 (NWS-04, 05)
  newsReserve: '0 20 * * 0',
  newsPublish: '0 8 * * *',
};

export type JobHandler = () => Promise<void>;

const handlers: Partial<Record<JobName, JobHandler>> = {};

/** 스프린트에서 구현체를 등록한다 */
export function setJobHandler(name: JobName, handler: JobHandler): void {
  handlers[name] = handler;
}

export function registerJobs(): void {
  for (const name of Object.keys(SCHEDULES) as JobName[]) {
    const handler = handlers[name];
    if (!handler) {
      logger.debug({ job: name }, '배치 핸들러 미등록(아직 구현 전)');
      continue;
    }
    cron.schedule(
      SCHEDULES[name],
      async () => {
        const started = Date.now();
        try {
          await handler();
          logger.info({ job: name, ms: Date.now() - started }, '배치 완료');
        } catch (err) {
          logger.error({ job: name, err }, '배치 실패');
        }
      },
      { timezone: TZ },
    );
    logger.info({ job: name, schedule: SCHEDULES[name] }, '배치 등록');
  }
}
