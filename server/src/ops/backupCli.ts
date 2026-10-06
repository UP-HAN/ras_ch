/**
 * 백업·복원 명령줄 도구 (BKP-01~05). 관리자 화면의 복원 버튼도 이 프로그램을 별도 프로세스로 띄운다.
 *
 *   node server/dist/ops/backupCli.js list
 *   node server/dist/ops/backupCli.js create [--label "메모"] [--kind manual|auto] [--actor <userId>]
 *   node server/dist/ops/backupCli.js prune
 *   node server/dist/ops/backupCli.js restore <id> (--pm2-id <id> | --no-pm2) [--actor <userId>]
 *
 * 개발 PC: npx tsx server/src/ops/backupCli.ts ...  (.env 에 BACKUP_DIR, MYSQL_BIN_DIR 필요)
 * 복원은 반드시 --pm2-id 또는 --no-pm2 를 명시해야 한다(다른 앱을 멈추는 사고 방지, BKP-05).
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { closePool } from '../db/pool.js';
import { BACKUP_KINDS, isBackupId, type BackupKind } from '../lib/backupRules.js';
import { BackupError } from '../services/backup/BackupService.js';
import {
  createRestoreDbOps,
  createRunner,
  getBackupService,
  migrationFileNames,
  uploadDirAbs,
} from '../services/backup/index.js';
import { runRestore } from '../services/backup/restore.js';
import { env } from '../config/env.js';

interface Args {
  command: string;
  positional: string[];
  flags: Record<string, string | true>;
}

export function parseArgs(argv: string[]): Args {
  const [command = 'help', ...rest] = argv;
  const positional: string[] = [];
  const flags: Record<string, string | true> = {};
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i] as string;
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = rest[i + 1];
      if (next !== undefined && !next.startsWith('--')) {
        flags[key] = next;
        i++;
      } else flags[key] = true;
    } else positional.push(a);
  }
  return { command, positional, flags };
}

const fmtBytes = (n: number): string => `${(n / 1024 / 1024).toFixed(1)}MB`;

async function main(argv: string[]): Promise<number> {
  const { command, positional, flags } = parseArgs(argv);
  if (command === 'help' || command === '--help') {
    console.log(
      '사용법: backupCli list | create [--label 메모] [--kind manual|auto] | prune | restore <id> (--pm2-id <id> | --no-pm2) [--actor <userId>]',
    );
    return 0;
  }
  const svc = getBackupService();
  if (!svc) {
    console.error('BACKUP_DIR 가 설정되지 않아 백업 기능이 꺼져 있습니다(.env).');
    return 2;
  }
  const actor =
    typeof flags.actor === 'string' && /^\d+$/.test(flags.actor) ? Number(flags.actor) : null;
  const log = (msg: string, extra?: Record<string, unknown>) =>
    console.log(`[${new Date().toISOString()}] ${msg}${extra ? ' ' + JSON.stringify(extra) : ''}`);

  switch (command) {
    case 'list': {
      const points = await svc.list();
      const status = await svc.status();
      console.log(`백업 폴더: ${svc.root} (디스크 여유 ${fmtBytes(status.diskFreeBytes)})`);
      if (status.busy)
        console.log(
          `진행 중: ${status.busy.op} (pid ${status.busy.pid}, ${status.busy.startedAt})`,
        );
      if (status.lastRestore) console.log(`마지막 복원: ${JSON.stringify(status.lastRestore)}`);
      for (const p of points) {
        console.log(
          `${p.id}  ${p.kind.padEnd(10)} DB ${fmtBytes(p.db.bytes)}  사진 ${fmtBytes(p.uploads.bytes)} (${p.uploads.fileCount}개)  ${p.lastMigration ?? '-'}  ${p.label}`,
        );
      }
      if (!points.length) console.log('(백업 없음)');
      return 0;
    }
    case 'create': {
      const kind = (typeof flags.kind === 'string' ? flags.kind : 'manual') as BackupKind;
      if (!BACKUP_KINDS.includes(kind))
        throw new Error(`kind 는 ${BACKUP_KINDS.join('|')} 중 하나`);
      const m = await svc.create(kind, {
        label: typeof flags.label === 'string' ? flags.label : '',
        createdBy: actor,
      });
      console.log(
        `백업 생성: ${m.id} (DB ${fmtBytes(m.db.bytes)}, 사진 ${fmtBytes(m.uploads.bytes)})`,
      );
      return 0;
    }
    case 'prune': {
      const deleted = await svc.prune();
      console.log(deleted.length ? `정리: ${deleted.join(', ')}` : '정리할 백업이 없습니다.');
      return 0;
    }
    case 'restore': {
      const id = positional[0];
      if (!isBackupId(id)) throw new Error('복원할 백업 id 를 주세요.');
      const pm2Id = typeof flags['pm2-id'] === 'string' ? flags['pm2-id'] : null;
      if (!pm2Id && flags['no-pm2'] !== true) {
        throw new Error('--pm2-id <id> 또는 --no-pm2 를 반드시 지정해야 합니다.');
      }
      const result = await runRestore(id, {
        svc,
        runner: createRunner(),
        uploadDir: uploadDirAbs(),
        dbName: env.DB_NAME,
        migrationFiles: migrationFileNames,
        db: createRestoreDbOps(),
        pm2Id,
        requestedBy: actor,
        log,
      });
      console.log(JSON.stringify(result, null, 2));
      return result.ok ? 0 : 1;
    }
    default:
      console.error(`알 수 없는 명령: ${command}`);
      return 2;
  }
}

const isCli =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isCli) {
  main(process.argv.slice(2))
    .then((code) => {
      process.exitCode = code;
    })
    .catch((err: unknown) => {
      if (err instanceof BackupError) console.error(`[${err.code}] ${err.message}`);
      else console.error(err instanceof Error ? err.message : err);
      process.exitCode = 1;
    })
    .finally(() => closePool());
}
