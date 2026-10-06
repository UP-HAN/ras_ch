/** 복원 절차 (BKP-03, BKP-05) — 순서·자동 되돌리기·실패 처리 */
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BackupService } from './BackupService.js';
import { fakeRunner, type FakeRunnerOptions } from './fakeRunner.test-helper.js';
import { runRestore, type RestoreDbOps } from './restore.js';

let root: string;
let uploads: string;

beforeEach(async () => {
  const base = await fsp.mkdtemp(path.join(os.tmpdir(), 'ras-rst-'));
  root = path.join(base, 'points');
  uploads = path.join(base, 'uploads');
  await fsp.mkdir(path.join(uploads, '2026', '10'), { recursive: true });
  await fsp.writeFile(path.join(uploads, '2026', '10', 'current.webp'), 'current');
  await fsp.writeFile(path.join(uploads, '.gitkeep'), '');
});
afterEach(async () => {
  await fsp.rm(path.dirname(root), { recursive: true, force: true });
});

function fakeDb(opts: { failDrop?: () => boolean; failMigrate?: boolean } = {}) {
  const calls: string[] = [];
  const db: RestoreDbOps = {
    async dropAllTables() {
      calls.push('dropAllTables');
      if (opts.failDrop?.()) throw new Error('drop 실패');
    },
    async migrateUp() {
      calls.push('migrateUp');
      if (opts.failMigrate) throw new Error('마이그레이션 실패');
      return [];
    },
    async clearSessions() {
      calls.push('clearSessions');
    },
    async writeAudit(e) {
      calls.push(`audit:${e.action}`);
    },
  };
  return { db, calls };
}

async function setup(runnerOpts: FakeRunnerOptions = {}, dbName = 'ras_point') {
  const runner = fakeRunner(runnerOpts);
  let t = 0;
  const svc = new BackupService({
    root,
    dbName,
    keepDays: 14,
    uploadDir: uploads,
    runner,
    lastMigration: async () => '007_council_gift_gamify.sql',
    now: () => new Date(Date.UTC(2026, 9, 5, 18, 0, t++)),
  });
  const point = await svc.create('manual', { label: '시범 전' });
  runner.calls.length = 0;
  return { svc, runner, point };
}

const deps = (
  s: Awaited<ReturnType<typeof setup>>,
  db: RestoreDbOps,
  pm2Id: string | null = '1',
) => ({
  svc: s.svc,
  runner: s.runner,
  uploadDir: uploads,
  dbName: 'ras_point',
  migrationFiles: async () => ['001_init.sql', '007_council_gift_gamify.sql'],
  db,
  pm2Id,
  requestedBy: 3,
});

describe('정상 복원 (BKP-03)', () => {
  it('검증 → 정지 → 직전 백업 → 사진 준비 → DB → 마이그레이션 → 사진 교체 → 세션·감사 → 시작 순서로 진행한다', async () => {
    const s = await setup();
    const { db, calls } = fakeDb();
    const result = await runRestore(s.point.id, deps(s, db));

    expect(result.ok).toBe(true);
    expect(result.phase).toBe('done');
    expect(result.safetyPointId).toMatch(/-prerestore$/);
    expect(result.requestedBy).toBe(3);
    expect(s.runner.calls).toEqual([
      'verifyDump',
      'verifyTar',
      'pm2:stop:1',
      'dumpDb',
      'tarCreate',
      'tarExtract',
      `importDb:${s.point.id}`,
      'pm2:start:1',
    ]);
    expect(calls).toEqual(['dropAllTables', 'migrateUp', 'clearSessions', 'audit:backup.restore']);

    // 사진 폴더는 백업 내용으로 바뀌고 임시 폴더는 남지 않는다
    const top = (await fsp.readdir(uploads)).sort();
    expect(top).toEqual(['.gitkeep', '2026']);
    expect(await fsp.readdir(path.join(uploads, '2026'))).toEqual(['09']);
    expect(await fsp.readFile(path.join(uploads, '2026', '09', 'restored.webp'), 'utf8')).toBe(
      'restored',
    );

    // 복원 직전 백업이 목록에 있고, 결과 파일과 잠금 해제
    const ids = (await s.svc.list()).map((p) => p.id);
    expect(ids).toContain(result.safetyPointId);
    expect((await s.svc.readLastRestore())?.phase).toBe('done');
    expect(await s.svc.currentLock()).toBeNull();
  });

  it('pm2 id 가 없으면(개발 PC) stop/start 를 건너뛴다', async () => {
    const s = await setup();
    const result = await runRestore(s.point.id, deps(s, fakeDb().db, null));
    expect(result.ok).toBe(true);
    expect(s.runner.calls.some((c) => c.startsWith('pm2:'))).toBe(false);
  });
});

describe('검증 실패는 아무것도 건드리지 않는다 (BKP-05)', () => {
  it('DB 파일이 손상되면 정지 전에 멈춘다', async () => {
    const s = await setup({ verifyDumpResult: false });
    const { db, calls } = fakeDb();
    const result = await runRestore(s.point.id, deps(s, db));
    expect(result.ok).toBe(false);
    expect(result.phase).toBe('verify');
    expect(result.error).toContain('손상');
    expect(s.runner.calls).toEqual(['verifyDump']);
    expect(calls).toEqual([]);
    expect(await fsp.readFile(path.join(uploads, '2026', '10', 'current.webp'), 'utf8')).toBe(
      'current',
    );
  });

  it('다른 DB 의 백업은 거부한다', async () => {
    const s = await setup({}, 'ras_demo');
    const result = await runRestore(s.point.id, { ...deps(s, fakeDb().db), dbName: 'ras_point' });
    expect(result.ok).toBe(false);
    expect(result.error).toContain('다른 데이터베이스');
    expect(s.runner.calls).toEqual([]);
  });

  it('지금 코드보다 새로운 스키마의 백업은 거부한다', async () => {
    const s = await setup();
    const result = await runRestore(s.point.id, {
      ...deps(s, fakeDb().db),
      migrationFiles: async () => ['001_init.sql'],
    });
    expect(result.ok).toBe(false);
    expect(result.error).toContain('새로운 구조');
  });

  it('없는 id 는 NOT_FOUND 로 끝난다', async () => {
    const s = await setup();
    const result = await runRestore('20260101-000000-manual', deps(s, fakeDb().db));
    expect(result.ok).toBe(false);
    expect(result.error).toContain('찾을 수 없');
  });
});

describe('DB 복원 실패 → 자동 되돌리기 (BKP-03)', () => {
  it('가져오기가 실패하면 복원 직전 백업으로 되돌리고 앱을 켠다', async () => {
    const s = await setup({ failImport: (f) => f.includes(s.point.id) });
    const { db, calls } = fakeDb();
    const result = await runRestore(s.point.id, deps(s, db));

    expect(result.ok).toBe(false);
    expect(result.phase).toBe('rolled-back');
    expect(result.error).toContain('되돌렸어요');
    const safety = result.safetyPointId as string;
    expect(s.runner.calls).toEqual([
      'verifyDump',
      'verifyTar',
      'pm2:stop:1',
      'dumpDb',
      'tarCreate',
      'tarExtract',
      `importDb:${s.point.id}`,
      `importDb:${safety}`,
      'pm2:start:1',
    ]);
    expect(calls).toEqual(['dropAllTables', 'dropAllTables', 'migrateUp']);
    // 사진은 원래대로
    expect(await fsp.readFile(path.join(uploads, '2026', '10', 'current.webp'), 'utf8')).toBe(
      'current',
    );
    expect((await fsp.readdir(uploads)).some((n) => n.startsWith('.restore-'))).toBe(false);
  });

  it('되돌리기도 실패하면 needs-manual 로 두고 앱을 켜지 않는다', async () => {
    let drops = 0;
    const s = await setup({ failImport: () => true });
    const { db } = fakeDb({ failDrop: () => ++drops > 99 });
    const result = await runRestore(s.point.id, deps(s, db));
    expect(result.ok).toBe(false);
    expect(result.phase).toBe('needs-manual');
    expect(result.error).toContain('연락');
    expect(s.runner.calls.includes('pm2:start:1')).toBe(false);
    expect(s.runner.calls.includes('pm2:stop:1')).toBe(true);
  });
});

describe('마무리 단계 실패', () => {
  it('세션 삭제 등 마무리에서 실패하면 앱은 켜고 needs-manual 로 남긴다', async () => {
    const s = await setup();
    const { db } = fakeDb();
    db.clearSessions = async () => {
      throw new Error('세션 삭제 실패');
    };
    const result = await runRestore(s.point.id, deps(s, db));
    expect(result.ok).toBe(false);
    expect(result.phase).toBe('needs-manual');
    expect(s.runner.calls.at(-1)).toBe('pm2:start:1');
  });

  it('pm2 정지가 실패하면 복원 직전 백업을 만들지 않고 끝낸다', async () => {
    const s = await setup({ failPm2: true });
    const result = await runRestore(s.point.id, deps(s, fakeDb().db));
    expect(result.ok).toBe(false);
    expect(result.phase).toBe('stop');
    expect(s.runner.calls.includes('dumpDb')).toBe(false);
  });
});
