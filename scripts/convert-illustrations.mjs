/**
 * 일러스트 PNG → webp 변환 (디자인 개편 01-spec 6.7)
 *   node scripts/convert-illustrations.mjs
 *  - 입력: outputs/art/NN-*.png  →  출력: client/public/illustrations/NN-*.webp (같은 이름)
 *  - 마스코트 512x512 quality 80 / 큰 그림(08·09) 960x640 quality 78, fit: cover
 *  - 상한(마스코트 60KB, 큰 그림 120KB)을 넘으면 quality 를 5씩 낮춰 최대 2번 다시
 *  - 없는 PNG 는 "변환 대기" 로 알려 주고 넘어간다. 여러 번 다시 돌려도 된다
 */
import console from 'node:console';
import { existsSync } from 'node:fs';
import { mkdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp'; // server 의존성 (workspaces 로 루트 node_modules 에 있음)

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(root, 'outputs', 'art');
const OUT = path.join(root, 'client', 'public', 'illustrations');

const KB = 1024;
const MASCOT = { width: 512, height: 512, quality: 80, maxBytes: 60 * KB };
const SCENE = { width: 960, height: 640, quality: 78, maxBytes: 120 * KB };
const TOTAL_MAX = 700 * KB;

const FILES = [
  ['01-mascot-hello', MASCOT],
  ['02-mascot-cheer', MASCOT],
  ['03-mascot-sleep', MASCOT],
  ['04-mascot-think', MASCOT],
  ['05-mascot-write', MASCOT],
  ['06-mascot-trophy', MASCOT],
  ['07-mascot-oops', MASCOT],
  ['08-login-hero', SCENE],
  ['09-activities', SCENE],
  ['10-mascot-shine', MASCOT],
];

await mkdir(OUT, { recursive: true });

let total = 0;
let done = 0;
const waiting = [];
const over = [];

for (const [name, spec] of FILES) {
  const src = path.join(SRC, `${name}.png`);
  const dest = path.join(OUT, `${name}.webp`);
  if (!existsSync(src)) {
    waiting.push(name);
    console.log(`변환 대기  ${name}.png 가 아직 없어요`);
    continue;
  }
  let quality = spec.quality;
  let buf;
  for (let attempt = 0; attempt <= 2; attempt += 1) {
    buf = await sharp(src)
      .resize(spec.width, spec.height, { fit: 'cover' })
      .webp({ quality, effort: 6 })
      .toBuffer();
    if (buf.length <= spec.maxBytes || attempt === 2) break;
    quality -= 5;
  }
  await writeFile(dest, buf);
  const size = (await stat(dest)).size;
  total += size;
  done += 1;
  if (size > spec.maxBytes) over.push(name);
  console.log(
    `변환 완료  ${name}.webp  ${spec.width}x${spec.height}  q${quality}  ${(size / KB).toFixed(1)}KB`,
  );
}

console.log(
  `\n완료 ${done}장 / 대기 ${waiting.length}장 · webp 합계 ${(total / KB).toFixed(1)}KB (상한 700KB)`,
);
if (over.length) console.log(`상한 초과: ${over.join(', ')}`);
if (total > TOTAL_MAX) console.log('합계가 700KB 를 넘어요');
if (over.length || total > TOTAL_MAX) process.exitCode = 1;
