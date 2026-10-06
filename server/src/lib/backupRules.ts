/**
 * 백업 지점 규칙 (BKP-01, BKP-02, BKP-05) — 파일 시스템·DB 를 건드리지 않는 순수 함수 모음.
 *  - id: `YYYYMMDD-HHmmss-<kind>` (KST). 정규식으로만 받아 경로 조작을 막는다.
 *  - manifest.json 스키마와 파서
 *  - 보관 규칙: 자동·복원 직전 백업은 keepDays 지나면 정리, 최근 자동 N개는 남김, 직접 만든 것은 보관
 *  - mysql 옵션 파일(비밀번호를 명령줄에 노출하지 않기 위한 --defaults-extra-file) 본문
 */
import { z } from 'zod';
import { kst, type DateInput } from './time.js';

export const BACKUP_KINDS = ['auto', 'manual', 'prerestore'] as const;
export type BackupKind = (typeof BACKUP_KINDS)[number];

export const BACKUP_ID_RE = /^(\d{8})-(\d{6})-(auto|manual|prerestore)$/;

export const LABEL_MAX = 60;
export const labelSchema = z
  .string()
  .trim()
  .max(LABEL_MAX, `메모는 ${LABEL_MAX}자까지 쓸 수 있어요.`);

/** 백업 폴더 안의 고정 파일 이름. backup.sh 의 find 패턴(db-*.sql.gz, uploads-*.tar.gz)과 겹치지 않게 유지 */
export const DB_FILE = 'db.sql.gz';
export const UPLOADS_FILE = 'uploads.tar';
export const MANIFEST_FILE = 'manifest.json';

export function isBackupId(value: unknown): value is string {
  return typeof value === 'string' && BACKUP_ID_RE.test(value);
}

export function makeBackupId(kind: BackupKind, at?: DateInput): string {
  return `${kst(at).format('YYYYMMDD-HHmmss')}-${kind}`;
}

export function kindOfId(id: string): BackupKind | null {
  const m = BACKUP_ID_RE.exec(id);
  return m ? (m[3] as BackupKind) : null;
}

/** id 에 박힌 시각(KST) → Date. manifest 가 깨졌을 때의 대비용 */
export function createdAtFromId(id: string): Date | null {
  const m = BACKUP_ID_RE.exec(id);
  if (!m) return null;
  const d = m[1] as string;
  const t = m[2] as string;
  const iso = `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}T${t.slice(0, 2)}:${t.slice(2, 4)}:${t.slice(4, 6)}+09:00`;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

export const manifestSchema = z.object({
  version: z.literal(1),
  id: z.string().regex(BACKUP_ID_RE),
  kind: z.enum(BACKUP_KINDS),
  label: z.string().max(LABEL_MAX),
  createdAt: z.iso.datetime({ offset: true }),
  createdBy: z.number().int().positive().nullable(),
  dbName: z.string().min(1),
  lastMigration: z.string().nullable(),
  db: z.object({
    bytes: z.number().int().nonnegative(),
    sha256: z.string().regex(/^[0-9a-f]{64}$/),
  }),
  uploads: z.object({
    bytes: z.number().int().nonnegative(),
    fileCount: z.number().int().nonnegative(),
  }),
});

export type BackupManifest = z.infer<typeof manifestSchema>;

/** JSON 으로 읽은 값을 manifest 로. 형식이 다르거나 id 가 폴더 이름과 다르면 null */
export function parseManifest(raw: unknown, expectedId?: string): BackupManifest | null {
  const r = manifestSchema.safeParse(raw);
  if (!r.success) return null;
  if (expectedId !== undefined && r.data.id !== expectedId) return null;
  if (r.data.kind !== kindOfId(r.data.id)) return null;
  return r.data;
}

export interface PrunableInput {
  id: string;
  kind: BackupKind;
  createdAt: string;
}

export const KEEP_MIN_AUTO = 3;

/**
 * 정리 대상 id (BKP-02). manual 은 절대 포함하지 않는다.
 * auto 는 keepDays 를 넘긴 것 중 최근 KEEP_MIN_AUTO 개를 뺀 나머지, prerestore 는 keepDays 를 넘긴 전부.
 */
export function selectPrunable(
  points: PrunableInput[],
  now: DateInput,
  keepDays: number,
  keepMinAuto = KEEP_MIN_AUTO,
): string[] {
  const cutoff = kst(now).subtract(keepDays, 'day');
  const expired = (p: PrunableInput) => kst(p.createdAt).isBefore(cutoff);
  const autos = points
    .filter((p) => p.kind === 'auto')
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
  const protectedAuto = new Set(autos.slice(0, keepMinAuto).map((p) => p.id));
  return points
    .filter((p) => p.kind !== 'manual' && expired(p) && !protectedAuto.has(p.id))
    .map((p) => p.id);
}

export interface MysqlClientConfig {
  host: string;
  port: number;
  user: string;
  password: string;
}

/** 옵션 파일 값 인용: 큰따옴표로 감싸고 백슬래시·큰따옴표를 이스케이프 */
export function quoteOptionValue(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

/** mysqldump·mysql 에 `--defaults-extra-file` 로 넘길 [client] 섹션 */
export function mysqlOptionFile(cfg: MysqlClientConfig): string {
  return [
    '[client]',
    `host=${quoteOptionValue(cfg.host)}`,
    `port=${cfg.port}`,
    `user=${quoteOptionValue(cfg.user)}`,
    `password=${quoteOptionValue(cfg.password)}`,
    '',
  ].join('\n');
}

/** 마이그레이션 파일 목록에 없는(=지금 코드보다 새로운) 스키마의 백업은 복원하지 않는다 (BKP-05) */
export function isMigrationKnown(lastMigration: string | null, files: string[]): boolean {
  return lastMigration === null || files.includes(lastMigration);
}

/** 백업 하나를 만들기 전 필요한 최소 여유 공간: 500MB 와 (최근 백업 크기 × 2) 중 큰 값 */
export const MIN_FREE_BYTES = 500 * 1024 * 1024;
export function requiredFreeBytes(lastPointBytes: number): number {
  return Math.max(MIN_FREE_BYTES, lastPointBytes * 2);
}
