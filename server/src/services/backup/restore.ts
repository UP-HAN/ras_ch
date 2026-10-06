/**
 * 복원 절차 (BKP-03, BKP-05). 앱과 분리된 프로세스(ops/backupCli.ts)에서 실행된다.
 *
 *  verify → stop(pm2) → safety(복원 직전 백업) → stage(사진 임시 풀기) → db(테이블 삭제·가져오기)
 *  → migrate → uploads(교체) → finish(세션 삭제·감사 로그) → start(pm2) → done
 *
 *  - verify 에서 실패하면 아무것도 건드리지 않는다
 *  - db/migrate 에서 실패하면 safety 백업으로 한 번 자동 되돌린다(rolled-back). 그것도 실패하면 needs-manual 로 두고 앱을 켜지 않는다
 *  - 진행 상태는 <BACKUP_DIR>/last-restore.json 에 단계마다 기록한다
 */
import fsp from 'node:fs/promises';
import path from 'node:path';
import { DB_FILE, isMigrationKnown, UPLOADS_FILE } from '../../lib/backupRules.js';
import {
  BackupError,
  type BackupService,
  type LastRestore,
  type RestorePhase,
} from './BackupService.js';
import type { BackupRunner } from './runner.js';

export interface RestoreDbOps {
  /** 스키마의 모든 테이블 삭제(FOREIGN_KEY_CHECKS=0) */
  dropAllTables(): Promise<void>;
  migrateUp(): Promise<string[]>;
  clearSessions(): Promise<void>;
  writeAudit(entry: {
    action: string;
    targetType: string;
    payload: Record<string, unknown>;
  }): Promise<void>;
}

export interface RestoreDeps {
  svc: BackupService;
  runner: BackupRunner;
  uploadDir: string;
  dbName: string;
  migrationFiles: () => Promise<string[]>;
  db: RestoreDbOps;
  /** pm2 프로세스 id. null 이면 stop/start 를 건너뛴다(개발 PC) */
  pm2Id: string | null;
  requestedBy: number | null;
  now?: () => Date;
  log?: (msg: string, extra?: Record<string, unknown>) => void;
}

const RESTORE_PREFIX = '.restore-';

/** 사진 폴더의 최상위 항목 중 복원 임시 폴더가 아닌 것 */
async function uploadEntries(dir: string): Promise<string[]> {
  const entries = await fsp.readdir(dir);
  return entries.filter((e) => !e.startsWith(RESTORE_PREFIX));
}

async function sweepStaging(dir: string): Promise<void> {
  await fsp.mkdir(dir, { recursive: true });
  for (const e of await fsp.readdir(dir)) {
    if (e.startsWith(RESTORE_PREFIX))
      await fsp.rm(path.join(dir, e), { recursive: true, force: true });
  }
}

/** 임시 폴더의 내용을 사진 폴더로 교체. 같은 파일 시스템 안의 rename 만 쓴다(마운트 지점이어도 안전) */
async function swapUploads(uploadDir: string, stageDir: string, oldDir: string): Promise<void> {
  await fsp.mkdir(oldDir);
  for (const e of await uploadEntries(uploadDir)) {
    await fsp.rename(path.join(uploadDir, e), path.join(oldDir, e));
  }
  for (const e of await fsp.readdir(stageDir)) {
    await fsp.rename(path.join(stageDir, e), path.join(uploadDir, e));
  }
  await fsp.rm(oldDir, { recursive: true, force: true });
  await fsp.rm(stageDir, { recursive: true, force: true });
}

export async function runRestore(id: string, deps: RestoreDeps): Promise<LastRestore> {
  const now = deps.now ?? (() => new Date());
  const log = deps.log ?? (() => undefined);
  const { svc, runner } = deps;

  const state: LastRestore = {
    id,
    safetyPointId: null,
    startedAt: now().toISOString(),
    finishedAt: null,
    ok: null,
    phase: 'verify',
    error: null,
    requestedBy: deps.requestedBy,
  };
  const setPhase = async (phase: RestorePhase): Promise<void> => {
    state.phase = phase;
    log(`복원 단계: ${phase}`, { id });
    await svc.writeLastRestore(state);
  };
  const finish = async (
    ok: boolean,
    phase: RestorePhase,
    error: string | null,
  ): Promise<LastRestore> => {
    state.ok = ok;
    state.phase = phase;
    state.error = error;
    state.finishedAt = now().toISOString();
    await svc.writeLastRestore(state);
    log(ok ? '복원 완료' : '복원 실패', { id, phase, error });
    return state;
  };
  const msg = (err: unknown): string => (err instanceof Error ? err.message : String(err));

  const release = await svc.acquireLock('restore', id);
  const stamp = now().getTime().toString(36);
  const stageDir = path.join(deps.uploadDir, `${RESTORE_PREFIX}tmp-${stamp}`);
  const oldDir = path.join(deps.uploadDir, `${RESTORE_PREFIX}old-${stamp}`);
  let stopped = false;
  let dbTouched = false;

  try {
    await setPhase('verify');
    const manifest = await svc.get(id);
    if (!manifest) throw new BackupError('NOT_FOUND', '그 백업을 찾을 수 없어요.');
    if (manifest.dbName !== deps.dbName) {
      throw new BackupError(
        'INSTANCE_MISMATCH',
        `다른 데이터베이스(${manifest.dbName})의 백업이라 복원할 수 없어요.`,
      );
    }
    if (!isMigrationKnown(manifest.lastMigration, await deps.migrationFiles())) {
      throw new BackupError(
        'VERIFY_FAILED',
        `이 백업(${manifest.lastMigration})은 지금 서버 코드보다 새로운 구조예요. 서버를 먼저 최신으로 배포해 주세요.`,
      );
    }
    const dir = svc.pointDir(id);
    const dbFile = path.join(dir, DB_FILE);
    const upFile = path.join(dir, UPLOADS_FILE);
    if (!(await runner.verifyDump(dbFile, manifest.db.sha256))) {
      throw new BackupError('VERIFY_FAILED', 'DB 백업 파일이 손상되어 복원할 수 없어요.');
    }
    if (!(await runner.verifyTar(upFile))) {
      throw new BackupError('VERIFY_FAILED', '사진 백업 파일이 손상되어 복원할 수 없어요.');
    }
    await sweepStaging(deps.uploadDir);

    await setPhase('stop');
    if (deps.pm2Id) {
      await runner.pm2('stop', deps.pm2Id);
      stopped = true;
    }

    await setPhase('safety');
    const safety = await svc.createWithinLock('prerestore', {
      label: `복원 직전 (${id})`,
      createdBy: deps.requestedBy,
    });
    state.safetyPointId = safety.id;

    await setPhase('stage');
    await runner.tarExtract(upFile, stageDir);

    try {
      await setPhase('db');
      dbTouched = true;
      await deps.db.dropAllTables();
      await runner.importDb(dbFile);
      await setPhase('migrate');
      await deps.db.migrateUp();
    } catch (err) {
      // 자동 되돌리기: 복원 직전 백업으로 DB 만 원상 복구(사진은 아직 바꾸지 않았다)
      const first = msg(err);
      log('DB 복원 실패 → 복원 직전 백업으로 되돌리기', { id, error: first });
      await fsp.rm(stageDir, { recursive: true, force: true });
      try {
        await deps.db.dropAllTables();
        await runner.importDb(path.join(svc.pointDir(safety.id), DB_FILE));
        await deps.db.migrateUp();
        dbTouched = false;
        if (stopped) await runner.pm2('start', deps.pm2Id as string);
        return await finish(
          false,
          'rolled-back',
          `복원에 실패해 직전 상태로 되돌렸어요. (${first})`,
        );
      } catch (rollbackErr) {
        return await finish(
          false,
          'needs-manual',
          `복원도 되돌리기도 실패했어요. 사이트를 멈춘 상태로 두었으니 관리자(개발자)에게 연락해 주세요. (${first} / ${msg(rollbackErr)})`,
        );
      }
    }

    await setPhase('uploads');
    await swapUploads(deps.uploadDir, stageDir, oldDir);

    await setPhase('finish');
    await deps.db.clearSessions();
    await deps.db.writeAudit({
      action: 'backup.restore',
      targetType: 'backup',
      payload: { id, safetyPointId: safety.id, requestedBy: deps.requestedBy },
    });
    dbTouched = false;

    await setPhase('start');
    if (stopped) await runner.pm2('start', deps.pm2Id as string);
    return await finish(true, 'done', null);
  } catch (err) {
    await fsp.rm(stageDir, { recursive: true, force: true }).catch(() => undefined);
    // 여기까지 왔으면 DB 는 일관된 상태(건드리지 않았거나, 가져오기·마이그레이션까지 끝남)라 앱은 다시 켠다
    if (stopped) await runner.pm2('start', deps.pm2Id as string).catch(() => undefined);
    if (dbTouched) {
      // uploads 교체·세션 삭제 등 마무리 단계 실패: DB 는 복원됐지만 사진이 일부만 바뀌었을 수 있다
      return await finish(
        false,
        'needs-manual',
        `DB 는 복원됐지만 마무리 중 실패했어요(사진 일부가 안 맞을 수 있어요). 관리자(개발자)에게 연락해 주세요. (${msg(err)})`,
      );
    }
    return await finish(false, state.phase, msg(err));
  } finally {
    await release();
  }
}
