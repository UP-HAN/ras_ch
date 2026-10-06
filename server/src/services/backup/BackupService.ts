/**
 * 백업 지점 서비스 (BKP-01, BKP-02, BKP-04, BKP-05)
 *  - 지점 = <root>/<id>/{db.sql.gz, uploads.tar, manifest.json}. 목록은 이 폴더들에서 읽는다(DB 밖).
 *  - 만들 때는 <root>/.tmp-<id>/ 에서 작업하고 manifest 를 마지막에 쓴 뒤 이름을 바꾼다
 *  - 잠금: <root>/.lock/ 폴더(mkdir 원자성) + lock.json {pid, op, startedAt}. 죽은 pid 의 잠금은 회수
 *  - 인스턴스 표식: <root>/.instance.json {dbName}. 현재 DB_NAME 과 다르면 모든 동작 거부
 *  - 복원 결과: <root>/last-restore.json (restore.ts 가 쓴다)
 */
import fsp from 'node:fs/promises';
import path from 'node:path';
import {
  type BackupKind,
  type BackupManifest,
  DB_FILE,
  isBackupId,
  LABEL_MAX,
  makeBackupId,
  MANIFEST_FILE,
  parseManifest,
  requiredFreeBytes,
  selectPrunable,
  UPLOADS_FILE,
} from '../../lib/backupRules.js';
import type { BackupRunner } from './runner.js';

export type BackupErrorCode =
  | 'DISABLED'
  | 'BUSY'
  | 'INSTANCE_MISMATCH'
  | 'DISK_LOW'
  | 'NOT_FOUND'
  | 'INVALID_ID'
  | 'VERIFY_FAILED'
  | 'PM2_UNAVAILABLE'
  | 'FAILED';

export class BackupError extends Error {
  constructor(
    readonly code: BackupErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'BackupError';
  }
}

export type RestoreOp = 'create' | 'restore' | 'delete' | 'prune';

export interface LockInfo {
  pid: number;
  op: RestoreOp;
  startedAt: string;
  /** 복원이면 대상 id */
  targetId?: string;
}

export type RestorePhase =
  | 'verify'
  | 'stop'
  | 'safety'
  | 'stage'
  | 'db'
  | 'migrate'
  | 'uploads'
  | 'finish'
  | 'start'
  | 'done'
  | 'rolled-back'
  | 'needs-manual';

export interface LastRestore {
  id: string;
  safetyPointId: string | null;
  startedAt: string;
  finishedAt: string | null;
  ok: boolean | null;
  phase: RestorePhase;
  error: string | null;
  requestedBy: number | null;
}

export interface BackupStatus {
  busy: LockInfo | null;
  lastRestore: LastRestore | null;
  lastError: { op: RestoreOp; at: string; message: string } | null;
  diskFreeBytes: number;
  diskTotalBytes: number;
}

export interface BackupServiceDeps {
  root: string;
  dbName: string;
  keepDays: number;
  uploadDir: string;
  runner: BackupRunner;
  /** schema_migrations 의 마지막 이름 */
  lastMigration: () => Promise<string | null>;
  now?: () => Date;
  log?: (msg: string, extra?: Record<string, unknown>) => void;
}

const LOCK_DIR = '.lock';
const LOCK_FILE = 'lock.json';
const INSTANCE_FILE = '.instance.json';
const LAST_RESTORE_FILE = 'last-restore.json';
const TMP_PREFIX = '.tmp-';

const isDead = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return false;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === 'ESRCH';
  }
};

async function readJson(file: string): Promise<unknown | null> {
  try {
    return JSON.parse(await fsp.readFile(file, 'utf8')) as unknown;
  } catch {
    return null;
  }
}

export class BackupService {
  private readonly now: () => Date;
  private readonly log: NonNullable<BackupServiceDeps['log']>;
  private lastError: BackupStatus['lastError'] = null;

  constructor(private readonly deps: BackupServiceDeps) {
    this.now = deps.now ?? (() => new Date());
    this.log = deps.log ?? (() => undefined);
  }

  get root(): string {
    return this.deps.root;
  }
  get keepDays(): number {
    return this.deps.keepDays;
  }

  pointDir(id: string): string {
    if (!isBackupId(id)) throw new BackupError('INVALID_ID', '백업 이름이 올바르지 않아요.');
    return path.join(this.deps.root, id);
  }

  // ----- 인스턴스 표식 (BKP-05) -----

  async ensureInstance(): Promise<void> {
    await fsp.mkdir(this.deps.root, { recursive: true, mode: 0o700 });
    const file = path.join(this.deps.root, INSTANCE_FILE);
    const existing = await readJson(file);
    if (existing === null) {
      await fsp.writeFile(file, JSON.stringify({ dbName: this.deps.dbName }), { mode: 0o600 });
      return;
    }
    const dbName = (existing as { dbName?: unknown }).dbName;
    if (dbName !== this.deps.dbName) {
      throw new BackupError(
        'INSTANCE_MISMATCH',
        `이 백업 폴더는 다른 데이터베이스(${String(dbName)})의 것이에요. 서버 설정(BACKUP_DIR)을 확인해 주세요.`,
      );
    }
  }

  // ----- 잠금 (BKP-04) -----

  async currentLock(): Promise<LockInfo | null> {
    const info = await readJson(path.join(this.deps.root, LOCK_DIR, LOCK_FILE));
    if (!info || typeof info !== 'object') return null;
    const lock = info as LockInfo;
    if (typeof lock.pid !== 'number') return null;
    return lock;
  }

  /** 잠금을 잡는다. 살아 있는 다른 작업이 있으면 BUSY. 반환값은 해제 함수 */
  async acquireLock(op: RestoreOp, targetId?: string): Promise<() => Promise<void>> {
    await this.ensureInstance();
    const dir = path.join(this.deps.root, LOCK_DIR);
    const file = path.join(dir, LOCK_FILE);
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        await fsp.mkdir(dir);
        const info: LockInfo = {
          pid: process.pid,
          op,
          startedAt: this.now().toISOString(),
          targetId,
        };
        await fsp.writeFile(file, JSON.stringify(info), { mode: 0o600 });
        return async () => {
          await fsp.rm(dir, { recursive: true, force: true });
        };
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err;
        // 같은 프로세스가 잡은 잠금(API 가 뒤에서 만들기 중)도 BUSY 다
        const holder = await this.currentLock();
        if (holder && !isDead(holder.pid)) {
          throw new BackupError(
            'BUSY',
            '지금 다른 백업·복원 작업이 진행 중이에요. 끝난 뒤 다시 해 주세요.',
          );
        }
        // 죽은 프로세스의 잠금(또는 읽을 수 없는 잠금)은 회수한다
        this.log('죽은 잠금 회수', { holder });
        await fsp.rm(dir, { recursive: true, force: true });
      }
    }
    throw new BackupError('BUSY', '잠금을 잡지 못했어요. 잠시 후 다시 해 주세요.');
  }

  // ----- 목록·상태 -----

  async list(): Promise<BackupManifest[]> {
    await this.ensureInstance();
    const entries = await fsp.readdir(this.deps.root, { withFileTypes: true });
    const out: BackupManifest[] = [];
    for (const e of entries) {
      if (!e.isDirectory() || !isBackupId(e.name)) continue;
      const m = parseManifest(
        await readJson(path.join(this.deps.root, e.name, MANIFEST_FILE)),
        e.name,
      );
      if (m) out.push(m);
    }
    return out.sort((a, b) => (a.id < b.id ? 1 : a.id > b.id ? -1 : 0));
  }

  async get(id: string): Promise<BackupManifest | null> {
    const dir = this.pointDir(id);
    return parseManifest(await readJson(path.join(dir, MANIFEST_FILE)), id);
  }

  async readLastRestore(): Promise<LastRestore | null> {
    const raw = await readJson(path.join(this.deps.root, LAST_RESTORE_FILE));
    return raw && typeof raw === 'object' && 'id' in raw ? (raw as LastRestore) : null;
  }

  async writeLastRestore(info: LastRestore): Promise<void> {
    await fsp.writeFile(
      path.join(this.deps.root, LAST_RESTORE_FILE),
      JSON.stringify(info, null, 2),
      {
        mode: 0o600,
      },
    );
  }

  async status(): Promise<BackupStatus> {
    await this.ensureInstance();
    const [busy, lastRestore, disk] = await Promise.all([
      this.currentLock().then((l) => (l && !isDead(l.pid) ? l : null)),
      this.readLastRestore(),
      this.deps.runner.diskFree(this.deps.root),
    ]);
    return {
      busy,
      lastRestore,
      lastError: this.lastError,
      diskFreeBytes: disk.freeBytes,
      diskTotalBytes: disk.totalBytes,
    };
  }

  // ----- 만들기 (BKP-01) -----

  /** 잠금을 잡고 백업을 만든다 */
  async create(
    kind: BackupKind,
    opts: { label?: string; createdBy?: number | null } = {},
  ): Promise<BackupManifest> {
    const release = await this.acquireLock('create');
    try {
      return await this.createWithinLock(kind, opts);
    } finally {
      await release();
    }
  }

  /**
   * 잠금만 먼저 잡고(BUSY·디스크 부족은 여기서 바로 알림) 나머지는 뒤에서 진행한다.
   * API 가 202 로 바로 응답하기 위한 진입점. 실패는 lastError 로 남긴다.
   */
  async startCreate(
    kind: BackupKind,
    opts: { label?: string; createdBy?: number | null } = {},
  ): Promise<string> {
    const release = await this.acquireLock('create');
    let id: string;
    try {
      await this.checkDisk();
      id = makeBackupId(kind, this.now());
    } catch (err) {
      await release();
      throw err;
    }
    void this.createWithinLock(kind, { ...opts, id })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        this.lastError = { op: 'create', at: this.now().toISOString(), message };
        this.log('백업 만들기 실패', { id, message });
      })
      .finally(() => void release());
    return id;
  }

  /** 호출자가 잠금을 이미 잡고 있을 때(복원 직전 백업 등) */
  async createWithinLock(
    kind: BackupKind,
    opts: { label?: string; createdBy?: number | null; id?: string } = {},
  ): Promise<BackupManifest> {
    await this.ensureInstance();
    await this.checkDisk();
    await this.sweepTmp();
    const id = opts.id ?? makeBackupId(kind, this.now());
    const label = (opts.label ?? '').trim().slice(0, LABEL_MAX);
    const finalDir = path.join(this.deps.root, id);
    const tmpDir = path.join(this.deps.root, `${TMP_PREFIX}${id}`);
    await fsp.mkdir(tmpDir, { mode: 0o700 });
    try {
      // DB 먼저, 사진은 그 다음: 사진 묶음이 DB 가 가리키는 파일의 상위 집합이 되게
      const db = await this.deps.runner.dumpDb(path.join(tmpDir, DB_FILE));
      const uploads = await this.deps.runner.tarCreate(
        this.deps.uploadDir,
        path.join(tmpDir, UPLOADS_FILE),
      );
      const manifest: BackupManifest = {
        version: 1,
        id,
        kind,
        label,
        createdAt: this.now().toISOString(),
        createdBy: opts.createdBy ?? null,
        dbName: this.deps.dbName,
        lastMigration: await this.deps.lastMigration(),
        db,
        uploads,
      };
      await fsp.writeFile(path.join(tmpDir, MANIFEST_FILE), JSON.stringify(manifest, null, 2), {
        mode: 0o600,
      });
      await fsp.rename(tmpDir, finalDir);
      this.lastError = null;
      this.log('백업 생성', { id, kind, dbBytes: db.bytes, uploadsBytes: uploads.bytes });
      return manifest;
    } catch (err) {
      await fsp.rm(tmpDir, { recursive: true, force: true });
      throw err;
    }
  }

  /** 디스크 여유 확인: 500MB 와 최근 백업 크기의 2배 중 큰 값 이상 남아야 한다 */
  async checkDisk(): Promise<void> {
    const points = await this.list();
    const last = points[0];
    const need = requiredFreeBytes(last ? last.db.bytes + last.uploads.bytes : 0);
    const { freeBytes } = await this.deps.runner.diskFree(this.deps.root);
    if (freeBytes < need) {
      const mb = (n: number) => Math.round(n / 1024 / 1024);
      throw new BackupError(
        'DISK_LOW',
        `서버 디스크 여유가 부족해요(남은 ${mb(freeBytes)}MB, 필요 ${mb(need)}MB). 오래된 백업을 지우고 다시 해 주세요.`,
      );
    }
  }

  /** 만들다 만 임시 폴더 정리 */
  async sweepTmp(): Promise<void> {
    const entries = await fsp.readdir(this.deps.root, { withFileTypes: true });
    for (const e of entries) {
      if (e.isDirectory() && e.name.startsWith(TMP_PREFIX)) {
        await fsp.rm(path.join(this.deps.root, e.name), { recursive: true, force: true });
      }
    }
  }

  // ----- 삭제·정리 (BKP-02) -----

  async delete(id: string): Promise<void> {
    const dir = this.pointDir(id);
    const release = await this.acquireLock('delete', id);
    try {
      if (!(await this.get(id))) throw new BackupError('NOT_FOUND', '그 백업을 찾을 수 없어요.');
      await fsp.rm(dir, { recursive: true, force: true });
      this.log('백업 삭제', { id });
    } finally {
      await release();
    }
  }

  /** 보관 기간이 지난 자동·복원 직전 백업 삭제. 지운 id 목록 반환 */
  async prune(): Promise<string[]> {
    const release = await this.acquireLock('prune');
    try {
      const points = await this.list();
      const targets = selectPrunable(points, this.now(), this.deps.keepDays);
      for (const id of targets) {
        await fsp.rm(this.pointDir(id), { recursive: true, force: true });
      }
      if (targets.length) this.log('백업 정리', { deleted: targets });
      return targets;
    } finally {
      await release();
    }
  }
}
