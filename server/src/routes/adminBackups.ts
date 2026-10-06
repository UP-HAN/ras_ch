/**
 * 백업·복원 관리자 API (BKP-01~05). 전부 requireRole('admin').
 *  GET    /admin/backups              목록 + 상태(진행 중, 마지막 복원, 디스크)
 *  POST   /admin/backups {label}      백업 만들기 → 202 {id} (뒤에서 진행, 목록의 busy 로 표시)
 *  DELETE /admin/backups/:id
 *  POST   /admin/backups/:id/restore {confirmId}  복원 프로세스 시작 → 202 {id}
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Router, type ErrorRequestHandler } from 'express';
import { z } from 'zod';
import { env, isProd } from '../config/env.js';
import { AppError, ok } from '../lib/apiResponse.js';
import {
  isBackupId,
  isMigrationKnown,
  labelSchema,
  type BackupManifest,
} from '../lib/backupRules.js';
import { logger } from '../lib/logger.js';
import { clientIp, currentUser, requireRole } from '../middleware/auth.js';
import { writeAudit } from '../repos/auditRepo.js';
import { BackupError, type BackupService } from '../services/backup/BackupService.js';
import { getBackupService, migrationFileNames } from '../services/backup/index.js';
import type { BackupListView, BackupPointView } from '../types/api.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(here, '../../..');

const STATUS_BY_CODE: Record<BackupError['code'], { status: number; code: string }> = {
  DISABLED: { status: 409, code: 'BACKUP_DISABLED' },
  BUSY: { status: 409, code: 'BACKUP_BUSY' },
  INSTANCE_MISMATCH: { status: 409, code: 'BACKUP_INSTANCE' },
  DISK_LOW: { status: 409, code: 'BACKUP_DISK_LOW' },
  NOT_FOUND: { status: 404, code: 'NOT_FOUND' },
  INVALID_ID: { status: 400, code: 'BAD_REQUEST' },
  VERIFY_FAILED: { status: 409, code: 'BACKUP_VERIFY_FAILED' },
  PM2_UNAVAILABLE: { status: 409, code: 'BACKUP_PM2_UNAVAILABLE' },
  FAILED: { status: 500, code: 'BACKUP_FAILED' },
};

/** BackupError → AppError 로 바꿔 공통 errorHandler 에 넘긴다 */
const translateErrors: ErrorRequestHandler = (err, _req, _res, next) => {
  if (err instanceof BackupError) {
    const m = STATUS_BY_CODE[err.code];
    next(new AppError(m.status, m.code, err.message));
    return;
  }
  next(err);
};

function requireService(): BackupService {
  const svc = getBackupService();
  if (!svc)
    throw new BackupError('DISABLED', '이 서버에는 백업 폴더(BACKUP_DIR)가 설정되어 있지 않아요.');
  return svc;
}

const idParam = (raw: unknown): string => {
  const id = Array.isArray(raw) ? raw[0] : raw;
  if (!isBackupId(id)) throw new BackupError('INVALID_ID', '백업 이름이 올바르지 않아요.');
  return id;
};

export function toPointView(
  m: BackupManifest,
  migrationFiles: string[],
  dbName: string,
): BackupPointView {
  return {
    id: m.id,
    kind: m.kind,
    label: m.label,
    createdAt: m.createdAt,
    createdBy: m.createdBy,
    lastMigration: m.lastMigration,
    dbBytes: m.db.bytes,
    uploadsBytes: m.uploads.bytes,
    fileCount: m.uploads.fileCount,
    restorable: m.dbName === dbName && isMigrationKnown(m.lastMigration, migrationFiles),
  };
}

const DISABLED_VIEW: BackupListView = {
  enabled: false,
  keepDays: 0,
  diskFreeBytes: 0,
  diskTotalBytes: 0,
  busy: null,
  lastRestore: null,
  lastError: null,
  points: [],
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * 복원 CLI 를 앱과 분리된 프로세스로 띄운다 (BKP-03).
 * pm2 는 자식 프로세스까지 함께 죽이므로 리눅스에서는 `setsid -f` 로 떼어 낸 뒤 CLI 가 스스로 pm2 stop 을 부른다.
 * pm2 대상은 이 프로세스의 pm_id 만 넘긴다(BKP-05).
 */
export async function launchRestore(
  svc: BackupService,
  id: string,
  actorId: number,
): Promise<void> {
  const pm2Id = process.env.pm_id;
  if (isProd && !pm2Id) {
    throw new BackupError(
      'PM2_UNAVAILABLE',
      '서버가 pm2 로 실행되고 있지 않아 화면에서 복원을 시작할 수 없어요.',
    );
  }
  const ext = path.extname(fileURLToPath(import.meta.url)); // 개발(tsx)은 .ts, 배포(dist)는 .js
  const cli = path.resolve(here, `../ops/backupCli${ext}`);
  const args = [
    ...process.execArgv,
    cli,
    'restore',
    id,
    ...(pm2Id ? ['--pm2-id', pm2Id] : ['--no-pm2']),
    '--actor',
    String(actorId),
  ];
  const [cmd, cmdArgs] =
    process.platform === 'linux'
      ? ['setsid', ['-f', process.execPath, ...args]]
      : [process.execPath, args];
  const logFd = fs.openSync(path.join(svc.root, 'restore.log'), 'a', 0o600);
  try {
    const child = spawn(cmd, cmdArgs, {
      cwd: REPO_ROOT,
      detached: true,
      stdio: ['ignore', logFd, logFd],
      windowsHide: true,
    });
    child.on('error', (err) => logger.error({ err }, '복원 프로세스 실행 실패'));
    child.unref();
  } finally {
    fs.closeSync(logFd);
  }
  // CLI 가 잠금을 잡을 때까지(최대 5초) 기다려 "시작됨"을 확인한다
  for (let i = 0; i < 25; i++) {
    const lock = await svc.currentLock();
    if (lock?.op === 'restore' && lock.targetId === id) return;
    const last = await svc.readLastRestore();
    if (last?.id === id && last.finishedAt) {
      if (last.ok) return;
      throw new BackupError('FAILED', last.error ?? '복원이 시작 직후 실패했어요.');
    }
    await sleep(200);
  }
  throw new BackupError(
    'FAILED',
    '복원 프로세스가 시작되지 않았어요. 서버의 restore.log 를 확인해 주세요.',
  );
}

export function createAdminBackupsRouter(): Router {
  const router = Router();
  router.use(requireRole('admin'));
  const actor = (req: Parameters<typeof currentUser>[0]) => ({
    id: currentUser(req).row.id,
    ip: clientIp(req),
  });

  router.get('/', async (_req, res) => {
    const svc = getBackupService();
    if (!svc) {
      res.json(ok(DISABLED_VIEW));
      return;
    }
    const [points, status, files] = await Promise.all([
      svc.list(),
      svc.status(),
      migrationFileNames(),
    ]);
    const view: BackupListView = {
      enabled: true,
      keepDays: svc.keepDays,
      diskFreeBytes: status.diskFreeBytes,
      diskTotalBytes: status.diskTotalBytes,
      busy: status.busy
        ? { op: status.busy.op, startedAt: status.busy.startedAt, targetId: status.busy.targetId }
        : null,
      lastRestore: status.lastRestore,
      lastError: status.lastError,
      points: points.map((m) => toPointView(m, files, env.DB_NAME)),
    };
    res.json(ok(view));
  });

  router.post('/', async (req, res) => {
    const body = z.object({ label: labelSchema.default('') }).safeParse(req.body ?? {});
    if (!body.success) throw AppError.badRequest('메모는 60자까지 쓸 수 있어요.');
    const svc = requireService();
    const a = actor(req);
    const id = await svc.startCreate('manual', { label: body.data.label, createdBy: a.id });
    await writeAudit({
      actorId: a.id,
      action: 'backup.create',
      targetType: 'backup',
      payload: { id },
      ip: a.ip,
    });
    res.status(202).json(ok({ id }));
  });

  router.delete('/:id', async (req, res) => {
    const id = idParam(req.params.id);
    const svc = requireService();
    const a = actor(req);
    await svc.delete(id);
    await writeAudit({
      actorId: a.id,
      action: 'backup.delete',
      targetType: 'backup',
      payload: { id },
      ip: a.ip,
    });
    res.json(ok({ deleted: true }));
  });

  router.post('/:id/restore', async (req, res) => {
    const id = idParam(req.params.id);
    const body = z.object({ confirmId: z.string() }).safeParse(req.body ?? {});
    if (!body.success || body.data.confirmId !== id) {
      throw AppError.badRequest('확인을 위해 백업 이름을 그대로 입력해 주세요.');
    }
    const svc = requireService();
    const a = actor(req);
    const status = await svc.status();
    if (status.busy)
      throw new BackupError(
        'BUSY',
        '지금 다른 백업·복원 작업이 진행 중이에요. 끝난 뒤 다시 해 주세요.',
      );
    const m = await svc.get(id);
    if (!m) throw new BackupError('NOT_FOUND', '그 백업을 찾을 수 없어요.');
    if (!toPointView(m, await migrationFileNames(), env.DB_NAME).restorable) {
      throw new BackupError(
        'VERIFY_FAILED',
        '이 백업은 지금 서버에서 복원할 수 없어요(다른 DB 또는 더 새로운 구조).',
      );
    }
    // 복원이 끝나면 DB(감사 로그 포함)가 되돌아가므로, 요청 기록은 복원 CLI 가 끝에 다시 남긴다(backup.restore)
    await writeAudit({
      actorId: a.id,
      action: 'backup.restore_request',
      targetType: 'backup',
      payload: { id },
      ip: a.ip,
    });
    await launchRestore(svc, id, a.id);
    res.status(202).json(ok({ id }));
  });

  router.use(translateErrors);
  return router;
}
