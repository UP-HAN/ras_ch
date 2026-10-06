/** 백업 규칙 (BKP-01, BKP-02, BKP-05) — 순수 함수 */
import { describe, expect, it } from 'vitest';
import {
  createdAtFromId,
  isBackupId,
  isMigrationKnown,
  kindOfId,
  makeBackupId,
  MIN_FREE_BYTES,
  mysqlOptionFile,
  parseManifest,
  quoteOptionValue,
  requiredFreeBytes,
  selectPrunable,
  type BackupManifest,
} from './backupRules.js';

const manifest = (over: Partial<BackupManifest> = {}): BackupManifest => ({
  version: 1,
  id: '20261006-033000-auto',
  kind: 'auto',
  label: '',
  createdAt: '2026-10-06T03:30:00+09:00',
  createdBy: null,
  dbName: 'ras_point',
  lastMigration: '007_council_gift_gamify.sql',
  db: { bytes: 10, sha256: 'a'.repeat(64) },
  uploads: { bytes: 20, fileCount: 2 },
  ...over,
});

describe('백업 id (BKP-01)', () => {
  it('KST 시각과 종류로 만든다', () => {
    expect(makeBackupId('manual', '2026-10-06T03:30:00+09:00')).toBe('20261006-033000-manual');
    expect(makeBackupId('auto', '2026-10-05T18:30:00Z')).toBe('20261006-033000-auto');
  });

  it('형식에 맞는 것만 받고 경로 조작은 거부한다', () => {
    expect(isBackupId('20261006-033000-auto')).toBe(true);
    expect(isBackupId('20261006-033000-prerestore')).toBe(true);
    expect(isBackupId('../20261006-033000-auto')).toBe(false);
    expect(isBackupId('20261006-033000-auto/..')).toBe(false);
    expect(isBackupId('20261006-033000-weekly')).toBe(false);
    expect(isBackupId('')).toBe(false);
    expect(isBackupId(42)).toBe(false);
  });

  it('종류와 시각을 되돌려 읽는다', () => {
    expect(kindOfId('20261006-033000-manual')).toBe('manual');
    expect(kindOfId('nope')).toBeNull();
    expect(createdAtFromId('20261006-033000-auto')?.toISOString()).toBe('2026-10-05T18:30:00.000Z');
    expect(createdAtFromId('x')).toBeNull();
  });
});

describe('manifest 파서', () => {
  it('올바른 manifest 를 받는다', () => {
    expect(parseManifest(manifest(), '20261006-033000-auto')).toEqual(manifest());
  });
  it('폴더 이름과 id 가 다르면 null', () => {
    expect(parseManifest(manifest(), '20261006-033001-auto')).toBeNull();
  });
  it('id 의 종류와 kind 가 다르면 null', () => {
    expect(parseManifest(manifest({ kind: 'manual' }))).toBeNull();
  });
  it('형식이 깨지면 null', () => {
    expect(parseManifest({ version: 2 })).toBeNull();
    expect(parseManifest(null)).toBeNull();
    expect(parseManifest(manifest({ db: { bytes: -1, sha256: 'zz' } }))).toBeNull();
  });
});

describe('보관 규칙 (BKP-02)', () => {
  const now = '2026-10-20T12:00:00+09:00';
  const p = (id: string, kind: 'auto' | 'manual' | 'prerestore', createdAt: string) => ({
    id,
    kind,
    createdAt,
  });

  it('manual 은 아무리 오래돼도 지우지 않는다', () => {
    const r = selectPrunable(
      [p('20260101-000000-manual', 'manual', '2026-01-01T00:00:00+09:00')],
      now,
      14,
    );
    expect(r).toEqual([]);
  });

  it('keepDays 를 넘긴 auto 만 지우되 최근 3개는 남긴다', () => {
    const olds = [1, 2, 3, 4, 5].map((d) =>
      p(`2026090${d}-033000-auto`, 'auto' as const, `2026-09-0${d}T03:30:00+09:00`),
    );
    const fresh = p('20261019-033000-auto', 'auto', '2026-10-19T03:30:00+09:00');
    const r = selectPrunable([...olds, fresh], now, 14);
    // 최근 3개(10/19, 9/5, 9/4) 보호 → 9/1, 9/2, 9/3 만 정리
    expect(r.sort()).toEqual([
      '20260901-033000-auto',
      '20260902-033000-auto',
      '20260903-033000-auto',
    ]);
  });

  it('기간 안의 auto 는 지우지 않는다', () => {
    const r = selectPrunable(
      [p('20261010-033000-auto', 'auto', '2026-10-10T03:30:00+09:00')],
      now,
      14,
    );
    expect(r).toEqual([]);
  });

  it('prerestore 는 기간이 지나면 전부 지운다 (최근 3개 보호 없음)', () => {
    const r = selectPrunable(
      [
        p('20260901-100000-prerestore', 'prerestore', '2026-09-01T10:00:00+09:00'),
        p('20261019-100000-prerestore', 'prerestore', '2026-10-19T10:00:00+09:00'),
      ],
      now,
      14,
    );
    expect(r).toEqual(['20260901-100000-prerestore']);
  });
});

describe('mysql 옵션 파일', () => {
  it('비밀번호의 따옴표·백슬래시를 이스케이프한다', () => {
    expect(quoteOptionValue('pa"ss\\word')).toBe('"pa\\"ss\\\\word"');
  });
  it('[client] 섹션을 만든다', () => {
    const text = mysqlOptionFile({ host: '127.0.0.1', port: 3306, user: 'ras', password: 'p^^' });
    expect(text.split('\n')).toEqual([
      '[client]',
      'host="127.0.0.1"',
      'port=3306',
      'user="ras"',
      'password="p^^"',
      '',
    ]);
  });
});

describe('복원 가능 여부·디스크 (BKP-05, BKP-01)', () => {
  it('마이그레이션 목록에 없는 스키마는 복원 불가', () => {
    const files = ['001_init.sql', '007_council_gift_gamify.sql'];
    expect(isMigrationKnown('007_council_gift_gamify.sql', files)).toBe(true);
    expect(isMigrationKnown(null, files)).toBe(true);
    expect(isMigrationKnown('008_future.sql', files)).toBe(false);
  });
  it('필요 여유 공간은 500MB 와 최근 백업의 2배 중 큰 값', () => {
    expect(requiredFreeBytes(0)).toBe(MIN_FREE_BYTES);
    expect(requiredFreeBytes(400 * 1024 * 1024)).toBe(800 * 1024 * 1024);
  });
});
