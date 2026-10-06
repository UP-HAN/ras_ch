/**
 * 자동 백업 배치 (BKP-02): 매일 03:30 백업 지점을 만들고, 성공하면 보관 기간이 지난 자동·복원 직전 백업을 정리한다.
 * BACKUP_DIR 가 없으면 아무 일도 하지 않는다. 다른 작업이 진행 중(BUSY)이면 이번 회차는 건너뛴다.
 */
import { logger } from '../lib/logger.js';
import { BackupError } from '../services/backup/BackupService.js';
import { getBackupService } from '../services/backup/index.js';
import { setJobHandler } from './index.js';

export async function runBackupPoint(): Promise<{ created: string | null; pruned: string[] }> {
  const svc = getBackupService();
  if (!svc) return { created: null, pruned: [] };
  try {
    const m = await svc.create('auto', { label: '자동 백업' });
    const pruned = await svc.prune();
    return { created: m.id, pruned };
  } catch (err) {
    if (err instanceof BackupError && err.code === 'BUSY') {
      logger.warn({ job: 'backupPoint' }, '다른 백업·복원 작업 중이라 자동 백업을 건너뜀');
      return { created: null, pruned: [] };
    }
    throw err;
  }
}

export function registerBackupJob(): void {
  setJobHandler('backupPoint', async () => {
    const r = await runBackupPoint();
    logger.info({ job: 'backupPoint', ...r }, '자동 백업');
  });
}
