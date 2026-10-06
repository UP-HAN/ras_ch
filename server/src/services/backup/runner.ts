/**
 * 백업·복원이 쓰는 외부 명령 실행기 (BKP-01, BKP-03). 테스트에서는 가짜 구현을 주입한다.
 *  - mysqldump / mysql : 비밀번호는 권한 600 임시 옵션 파일(--defaults-extra-file)로만 넘긴다
 *  - gzip/gunzip       : 윈도우 개발 PC 에 gzip 이 없으므로 Node zlib 로 처리
 *  - tar               : 경로 인자 없이 cwd + 표준 입출력으로만 쓴다(GNU tar 와 윈도우 bsdtar 차이 회피).
 *                        묶을 파일 목록은 우리가 걷어서 넘기므로(--null -T -) 복원 임시 폴더가 섞이지 않는다
 *  - pm2               : 넘겨받은 프로세스 id 만 stop/start
 */
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { PassThrough, Readable, Transform, Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import zlib from 'node:zlib';
import { mysqlOptionFile } from '../../lib/backupRules.js';

export interface DumpResult {
  bytes: number;
  sha256: string;
}
export interface TarResult {
  bytes: number;
  fileCount: number;
}

export interface BackupRunner {
  dumpDb(outFile: string): Promise<DumpResult>;
  importDb(inFile: string): Promise<void>;
  /** 압축 무결성 + sha256 + 덤프 끝 표식("Dump completed") 확인 */
  verifyDump(inFile: string, sha256: string): Promise<boolean>;
  /** srcDir 아래 파일들을 tar 로. 이름이 `.restore-` 로 시작하는 최상위 항목은 뺀다 */
  tarCreate(srcDir: string, outFile: string): Promise<TarResult>;
  tarExtract(inFile: string, destDir: string): Promise<void>;
  verifyTar(inFile: string): Promise<boolean>;
  pm2(action: 'stop' | 'start', id: string): Promise<void>;
  diskFree(dir: string): Promise<{ freeBytes: number; totalBytes: number }>;
}

export interface SystemRunnerConfig {
  mysqlBinDir?: string;
  pm2Bin?: string;
  db: { host: string; port: number; user: string; password: string; name: string };
  /** 외부 명령 하나의 최대 실행 시간(ms). 기본 30분 */
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 30 * 60 * 1000;
const STDERR_CAP = 4000;

interface RunOptions {
  cwd?: string;
  stdin?: Readable;
  stdout?: Writable;
  timeoutMs: number;
}

class CommandError extends Error {
  constructor(
    readonly cmd: string,
    readonly code: number | null,
    stderr: string,
  ) {
    super(`${cmd} 종료 코드 ${code ?? 'signal'}: ${stderr.trim() || '(stderr 없음)'}`);
    this.name = 'CommandError';
  }
}

/** 자식 프로세스를 실행하고, stdin/stdout 파이프와 종료를 함께 기다린다. 종료 코드 0 이 아니면 실패 */
async function run(cmd: string, args: string[], opts: RunOptions): Promise<void> {
  const child = spawn(cmd, args, {
    cwd: opts.cwd,
    stdio: [opts.stdin ? 'pipe' : 'ignore', opts.stdout ? 'pipe' : 'ignore', 'pipe'],
    shell: false,
    windowsHide: true,
  });
  let stderr = '';
  child.stderr?.on('data', (chunk: Buffer) => {
    if (stderr.length < STDERR_CAP) stderr += chunk.toString('utf8');
  });

  const timer = setTimeout(() => child.kill(), opts.timeoutMs);
  const exit = new Promise<void>((resolve, reject) => {
    child.on('error', (err) => reject(new CommandError(cmd, null, `실행 실패: ${err.message}`)));
    child.on('close', (code, signal) => {
      if (code === 0) resolve();
      else reject(new CommandError(cmd, code, signal ? `${signal} ${stderr}` : stderr));
    });
  });
  const pipes: Promise<void>[] = [];
  if (opts.stdin && child.stdin) pipes.push(pipeline(opts.stdin, child.stdin));
  if (opts.stdout && child.stdout) pipes.push(pipeline(child.stdout, opts.stdout));

  const [exitResult, ...pipeResults] = await Promise.allSettled([exit, ...pipes]);
  clearTimeout(timer);
  // 명령 자체의 실패(종료 코드)를 파이프 오류(EPIPE 등)보다 먼저 알린다
  if (exitResult.status === 'rejected') throw exitResult.reason;
  const failedPipe = pipeResults.find((r) => r.status === 'rejected');
  if (failedPipe && failedPipe.status === 'rejected') throw failedPipe.reason;
}

/** 통과하는 바이트의 sha256 과 길이를 재는 스트림 */
function meter(): { stream: Transform; result: () => DumpResult } {
  const hash = createHash('sha256');
  let bytes = 0;
  const stream = new Transform({
    transform(chunk: Buffer, _enc, cb) {
      hash.update(chunk);
      bytes += chunk.length;
      cb(null, chunk);
    },
  });
  return { stream, result: () => ({ bytes, sha256: hash.digest('hex') }) };
}

/** 마지막 n 바이트만 기억하는 싱크(덤프 끝 표식 확인용) */
function tailSink(n: number): { stream: Writable; tail: () => string } {
  let buf = Buffer.alloc(0);
  const stream = new Writable({
    write(chunk: Buffer, _enc, cb) {
      buf = Buffer.concat([buf, chunk]);
      if (buf.length > n) buf = buf.subarray(buf.length - n);
      cb();
    },
  });
  return { stream, tail: () => buf.toString('utf8') };
}

const RESTORE_PREFIX = '.restore-';

/** srcDir 아래 모든 파일의 상대 경로('/' 구분). 최상위 `.restore-*` 는 제외 */
export async function listUploadFiles(srcDir: string): Promise<string[]> {
  const out: string[] = [];
  const walk = async (rel: string): Promise<void> => {
    const entries = await fsp.readdir(path.join(srcDir, rel), { withFileTypes: true });
    for (const e of entries) {
      if (rel === '' && e.name.startsWith(RESTORE_PREFIX)) continue;
      const childRel = rel === '' ? e.name : `${rel}/${e.name}`;
      if (e.isDirectory()) await walk(childRel);
      else if (e.isFile()) out.push(childRel);
    }
  };
  await walk('');
  return out.sort();
}

export function createSystemRunner(cfg: SystemRunnerConfig): BackupRunner {
  const timeoutMs = cfg.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const exe = (name: string): string => {
    const base = cfg.mysqlBinDir ? path.join(cfg.mysqlBinDir, name) : name;
    return process.platform === 'win32' && cfg.mysqlBinDir ? `${base}.exe` : base;
  };

  /** 권한 600 임시 옵션 파일을 만들어 콜백 동안만 유지 */
  const withOptionFile = async <T>(fn: (file: string) => Promise<T>): Promise<T> => {
    const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'ras-mysql-'));
    const file = path.join(dir, 'client.cnf');
    try {
      await fsp.writeFile(file, mysqlOptionFile(cfg.db), { mode: 0o600 });
      return await fn(file);
    } finally {
      await fsp.rm(dir, { recursive: true, force: true });
    }
  };

  const resolvePm2 = async (): Promise<string> => {
    if (cfg.pm2Bin) return cfg.pm2Bin;
    const beside = path.join(path.dirname(process.execPath), 'pm2');
    try {
      await fsp.access(beside, fs.constants.X_OK);
      return beside;
    } catch {
      return 'pm2';
    }
  };

  return {
    async dumpDb(outFile) {
      return withOptionFile(async (optFile) => {
        const m = meter();
        const sink = new PassThrough();
        const toFile = pipeline(
          sink,
          zlib.createGzip({ level: 6 }),
          m.stream,
          fs.createWriteStream(outFile, { mode: 0o600 }),
        );
        await Promise.all([
          run(
            exe('mysqldump'),
            [
              `--defaults-extra-file=${optFile}`,
              '--no-tablespaces',
              '--single-transaction',
              '--quick',
              '--routines',
              '--triggers',
              '--set-gtid-purged=OFF',
              '--default-character-set=utf8mb4',
              cfg.db.name,
            ],
            { stdout: sink, timeoutMs },
          ),
          toFile,
        ]);
        return m.result();
      });
    },

    async importDb(inFile) {
      await withOptionFile(async (optFile) => {
        const source = new PassThrough();
        const fromFile = pipeline(fs.createReadStream(inFile), zlib.createGunzip(), source);
        await Promise.all([
          run(
            exe('mysql'),
            [`--defaults-extra-file=${optFile}`, '--default-character-set=utf8mb4', cfg.db.name],
            {
              stdin: source,
              timeoutMs,
            },
          ),
          fromFile,
        ]);
      });
    },

    async verifyDump(inFile, sha256) {
      try {
        const m = meter();
        const tail = tailSink(200);
        await pipeline(fs.createReadStream(inFile), m.stream, zlib.createGunzip(), tail.stream);
        return m.result().sha256 === sha256 && tail.tail().includes('Dump completed');
      } catch {
        return false;
      }
    },

    async tarCreate(srcDir, outFile) {
      const files = await listUploadFiles(srcDir);
      const list = Readable.from([Buffer.from(files.map((f) => `${f}\0`).join(''), 'utf8')]);
      await run('tar', ['-cf', '-', '--null', '-T', '-'], {
        cwd: srcDir,
        stdin: list,
        stdout: fs.createWriteStream(outFile, { mode: 0o600 }),
        timeoutMs,
      });
      const st = await fsp.stat(outFile);
      return { bytes: st.size, fileCount: files.length };
    },

    async tarExtract(inFile, destDir) {
      await fsp.mkdir(destDir, { recursive: true });
      await run('tar', ['-xf', '-'], {
        cwd: destDir,
        stdin: fs.createReadStream(inFile),
        timeoutMs,
      });
    },

    async verifyTar(inFile) {
      try {
        const drain = new Writable({ write: (_c, _e, cb) => cb() });
        await run('tar', ['-tf', '-'], {
          stdin: fs.createReadStream(inFile),
          stdout: drain,
          timeoutMs,
        });
        return true;
      } catch {
        return false;
      }
    },

    async pm2(action, id) {
      const bin = await resolvePm2();
      const drain = new Writable({ write: (_c, _e, cb) => cb() });
      await run(bin, [action, id], { stdout: drain, timeoutMs: 120_000 });
    },

    async diskFree(dir) {
      const st = await fsp.statfs(dir);
      return {
        freeBytes: Number(st.bavail) * Number(st.bsize),
        totalBytes: Number(st.blocks) * Number(st.bsize),
      };
    },
  };
}
