/** 백업 서비스 (BKP-01, BKP-02, BKP-04, BKP-05) — 가짜 실행기 + 임시 폴더 */
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type BackupError, BackupService } from './BackupService.js';
import { fakeRunner, type FakeRunnerOptions } from './fakeRunner.test-helper.js';

let root: string;
let uploads: string;

beforeEach(async () => {
  const base = await fsp.mkdtemp(path.join(os.tmpdir(), 'ras-bkp-'));
  root = path.join(base, 'points');
  uploads = path.join(base, 'uploads');
  await fsp.mkdir(path.join(uploads, '2026', '09'), { recursive: true });
  await fsp.writeFile(path.join(uploads, '2026', '09', 'a.webp'), 'a');
  await fsp.writeFile(path.join(uploads, '.gitkeep'), '');
});
afterEach(async () => {
  await fsp.rm(path.dirname(root), { recursive: true, force: true });
});

const makeSvc = (
  opts: FakeRunnerOptions = {},
  over: Partial<ConstructorParameters<typeof BackupService>[0]> = {},
) => {
  const runner = fakeRunner(opts);
  const svc = new BackupService({
    root,
    dbName: 'ras_point',
    keepDays: 14,
    uploadDir: uploads,
    runner,
    lastMigration: async () => '007_council_gift_gamify.sql',
    ...over,
  });
  return { svc, runner };
};

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('만들기 (BKP-01)', () => {
  it('db → 사진 순으로 만들고 manifest 를 마지막에 쓴 뒤 목록에 나타난다', async () => {
    const { svc, runner } = makeSvc();
    const m = await svc.create('manual', { label: '  시범 전  ', createdBy: 3 });
    expect(runner.calls).toEqual(['dumpDb', 'tarCreate']);
    expect(m.kind).toBe('manual');
    expect(m.label).toBe('시범 전');
    expect(m.createdBy).toBe(3);
    expect(m.dbName).toBe('ras_point');
    expect(m.lastMigration).toBe('007_council_gift_gamify.sql');
    expect(m.uploads.fileCount).toBe(2);
    const files = await fsp.readdir(path.join(root, m.id));
    expect(files.sort()).toEqual(['db.sql.gz', 'manifest.json', 'uploads.tar']);
    expect((await svc.list()).map((p) => p.id)).toEqual([m.id]);
    // 잠금은 풀렸고 임시 폴더는 없다
    expect(await svc.currentLock()).toBeNull();
    expect((await fsp.readdir(root)).filter((n) => n.startsWith('.tmp-'))).toEqual([]);
  });

  it('덤프가 실패하면 임시 폴더를 지우고 목록에 아무것도 남기지 않는다', async () => {
    const { svc } = makeSvc({ failDump: true });
    await expect(svc.create('manual')).rejects.toThrow('mysqldump 실패');
    expect(await svc.list()).toEqual([]);
    expect((await fsp.readdir(root)).filter((n) => n.startsWith('.tmp-'))).toEqual([]);
    expect(await svc.currentLock()).toBeNull();
  });

  it('디스크 여유가 부족하면 DISK_LOW 로 거부한다', async () => {
    const { svc } = makeSvc({ freeBytes: 100 * 1024 * 1024 });
    await expect(svc.create('manual')).rejects.toMatchObject({
      code: 'DISK_LOW',
    } satisfies Partial<BackupError>);
  });

  it('startCreate 는 잠금을 잡고 id 를 바로 돌려주며 뒤에서 완성한다', async () => {
    const { svc } = makeSvc();
    const id = await svc.startCreate('manual', { label: '빠른 응답' });
    expect(id).toMatch(/-manual$/);
    for (let i = 0; i < 50 && !(await svc.get(id)); i++) await wait(20);
    expect((await svc.get(id))?.label).toBe('빠른 응답');
    for (let i = 0; i < 50 && (await svc.currentLock()); i++) await wait(20);
    expect(await svc.currentLock()).toBeNull();
  });

  it('목록은 최신 id 가 먼저다', async () => {
    let t = 0;
    const { svc } = makeSvc({}, { now: () => new Date(Date.UTC(2026, 9, 5, 18, 0, t)) });
    await svc.create('auto');
    t = 1;
    await svc.create('manual');
    expect((await svc.list()).map((p) => p.id)).toEqual([
      '20261006-030001-manual',
      '20261006-030000-auto',
    ]);
  });
});

describe('잠금 (BKP-04)', () => {
  it('다른 작업이 잠금을 잡고 있으면 BUSY', async () => {
    const { svc } = makeSvc();
    const release = await svc.acquireLock('restore', '20261006-030000-auto');
    await expect(svc.create('manual')).rejects.toMatchObject({ code: 'BUSY' });
    expect((await svc.status()).busy).toMatchObject({
      op: 'restore',
      targetId: '20261006-030000-auto',
    });
    await release();
    await expect(svc.create('manual')).resolves.toBeTruthy();
  });

  it('죽은 프로세스의 잠금은 회수한다', async () => {
    const { svc } = makeSvc();
    await svc.ensureInstance();
    await fsp.mkdir(path.join(root, '.lock'));
    await fsp.writeFile(
      path.join(root, '.lock', 'lock.json'),
      JSON.stringify({ pid: 2_000_000_000, op: 'create', startedAt: '2026-10-06T00:00:00Z' }),
    );
    await expect(svc.create('manual')).resolves.toBeTruthy();
  });
});

describe('인스턴스 보호 (BKP-05)', () => {
  it('다른 DB 의 백업 폴더면 모든 동작을 거부한다', async () => {
    const { svc } = makeSvc();
    await svc.create('manual');
    const other = makeSvc({}, { dbName: 'ras_demo' }).svc;
    await expect(other.list()).rejects.toMatchObject({ code: 'INSTANCE_MISMATCH' });
    await expect(other.create('manual')).rejects.toMatchObject({ code: 'INSTANCE_MISMATCH' });
    await expect(other.status()).rejects.toMatchObject({ code: 'INSTANCE_MISMATCH' });
  });
});

describe('삭제·정리 (BKP-02)', () => {
  it('삭제는 폴더를 지우고, 없는 id 는 NOT_FOUND, 이상한 id 는 INVALID_ID', async () => {
    const { svc } = makeSvc();
    const m = await svc.create('manual');
    await svc.delete(m.id);
    expect(await svc.list()).toEqual([]);
    await expect(svc.delete(m.id)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(svc.delete('../etc')).rejects.toMatchObject({ code: 'INVALID_ID' });
  });

  it('정리는 오래된 auto·prerestore 만 지우고 manual 과 최근 auto 3개는 남긴다', async () => {
    const dates = [
      '2026-09-01T03:30:00+09:00',
      '2026-09-02T03:30:00+09:00',
      '2026-09-03T03:30:00+09:00',
      '2026-09-04T03:30:00+09:00',
      '2026-09-05T03:30:00+09:00',
    ];
    let i = 0;
    const { svc } = makeSvc(
      {},
      { now: () => new Date(dates[Math.min(i, dates.length - 1)] as string) },
    );
    for (; i < 4; i++) await svc.create('auto');
    await svc.create('prerestore'); // 9/5
    await svc.create('manual'); // 9/5
    i = 0;
    const later = makeSvc({}, { now: () => new Date('2026-10-20T12:00:00+09:00') }).svc;
    const pruned = await later.prune();
    expect(pruned.sort()).toEqual(['20260901-033000-auto', '20260905-033000-prerestore']);
    expect((await later.list()).map((p) => p.id).sort()).toEqual([
      '20260902-033000-auto',
      '20260903-033000-auto',
      '20260904-033000-auto',
      '20260905-033000-manual',
    ]);
  });
});
