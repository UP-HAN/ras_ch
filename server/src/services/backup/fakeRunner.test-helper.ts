/** 테스트용 가짜 실행기: 외부 명령 대신 파일을 흉내 내고 호출 순서를 기록한다 */
import { createHash } from 'node:crypto';
import fsp from 'node:fs/promises';
import path from 'node:path';
import type { BackupRunner } from './runner.js';

export interface FakeRunnerOptions {
  freeBytes?: number;
  failDump?: boolean;
  /** 가져오기 실패시킬 파일 경로 판별 */
  failImport?: (inFile: string) => boolean;
  verifyDumpResult?: boolean;
  verifyTarResult?: boolean;
  failPm2?: boolean;
  dumpContent?: string;
}

export interface FakeRunner extends BackupRunner {
  calls: string[];
  imported: string[];
}

export function fakeRunner(opts: FakeRunnerOptions = {}): FakeRunner {
  const calls: string[] = [];
  const imported: string[] = [];
  const content = opts.dumpContent ?? 'DUMP\n-- Dump completed';
  return {
    calls,
    imported,
    async dumpDb(outFile) {
      calls.push('dumpDb');
      if (opts.failDump) throw new Error('mysqldump 실패');
      await fsp.writeFile(outFile, content);
      return { bytes: content.length, sha256: createHash('sha256').update(content).digest('hex') };
    },
    async importDb(inFile) {
      calls.push(`importDb:${path.basename(path.dirname(inFile))}`);
      if (opts.failImport?.(inFile)) throw new Error('mysql 가져오기 실패');
      imported.push(await fsp.readFile(inFile, 'utf8'));
    },
    async verifyDump() {
      calls.push('verifyDump');
      return opts.verifyDumpResult ?? true;
    },
    async tarCreate(srcDir, outFile) {
      calls.push('tarCreate');
      const files = (await fsp.readdir(srcDir, { recursive: true, withFileTypes: true })).filter(
        (e) => e.isFile() && !e.parentPath.includes('.restore-'),
      );
      await fsp.writeFile(outFile, `TAR:${files.length}`);
      return { bytes: 4 + String(files.length).length, fileCount: files.length };
    },
    async tarExtract(_inFile, destDir) {
      calls.push('tarExtract');
      await fsp.mkdir(path.join(destDir, '2026', '09'), { recursive: true });
      await fsp.writeFile(path.join(destDir, '2026', '09', 'restored.webp'), 'restored');
      await fsp.writeFile(path.join(destDir, '.gitkeep'), '');
    },
    async verifyTar() {
      calls.push('verifyTar');
      return opts.verifyTarResult ?? true;
    },
    async pm2(action, id) {
      calls.push(`pm2:${action}:${id}`);
      if (opts.failPm2) throw new Error('pm2 실패');
    },
    async diskFree() {
      return { freeBytes: opts.freeBytes ?? 10 * 1024 ** 3, totalBytes: 40 * 1024 ** 3 };
    },
  };
}
