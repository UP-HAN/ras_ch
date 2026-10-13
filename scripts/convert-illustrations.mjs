/**
 * 일러스트 PNG → webp 변환 (디자인 개편 01-spec 6.7)
 *   node scripts/convert-illustrations.mjs
 *  - 입력: outputs/art/NN-*.png  →  출력: client/public/illustrations/NN-*.webp (같은 이름)
 *  - 마스코트 512x512 quality 80 / 큰 그림(08·09) 960x640 quality 78, fit: cover
 *  - 상한(마스코트 60KB, 큰 그림 120KB)을 넘으면 quality 를 5씩 낮춰 최대 2번 다시
 *  - RAS 아이콘(15~17) 은 128·256 두 크기(NN-이름-128.webp / -256.webp), 바깥 흰 바탕을 투명하게 만든다
 *    (가장자리에서 이어진 흰색만 지우므로 그림 안쪽 흰색은 남는다). 상한 128=12KB, 256=30KB
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
const ICON128 = {
  width: 128,
  height: 128,
  quality: 82,
  maxBytes: 12 * KB,
  suffix: '-128',
  clearBg: true,
};
const ICON256 = {
  width: 256,
  height: 256,
  quality: 82,
  maxBytes: 30 * KB,
  suffix: '-256',
  clearBg: true,
};
const TOTAL_MAX = 1100 * KB;

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
  // RAS = Reading·Art·Sports (2026-10-13 사용자 요청)
  ['12-ras-reading', MASCOT],
  ['13-ras-art', MASCOT],
  ['14-ras-sports', MASCOT],
  ['15-icon-reading', ICON128],
  ['15-icon-reading', ICON256],
  ['16-icon-art', ICON128],
  ['16-icon-art', ICON256],
  ['17-icon-sports', ICON128],
  ['17-icon-sports', ICON256],
];

/** 가장자리에서 이어진 거의 흰 픽셀을 투명하게 (아이콘 스티커 바깥 바탕 지우기) */
async function clearWhiteBackground(src, size) {
  const { data, info } = await sharp(src)
    .resize(size, size, { fit: 'cover' })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const w = info.width;
  const h = info.height;
  const isWhite = (i) => data[i * 4] > 238 && data[i * 4 + 1] > 238 && data[i * 4 + 2] > 238;
  const seen = new Uint8Array(w * h);
  const stack = [];
  for (let x = 0; x < w; x += 1) stack.push(x, (h - 1) * w + x);
  for (let y = 0; y < h; y += 1) stack.push(y * w, y * w + w - 1);
  while (stack.length) {
    const i = stack.pop();
    if (seen[i] || !isWhite(i)) continue;
    seen[i] = 1;
    data[i * 4 + 3] = 0;
    const x = i % w;
    if (x > 0) stack.push(i - 1);
    if (x < w - 1) stack.push(i + 1);
    if (i >= w) stack.push(i - w);
    if (i < w * (h - 1)) stack.push(i + w);
  }
  // 지운 곳과 맞닿은 밝은 테두리 픽셀은 반투명으로 (흰 테 없애기)
  for (let i = 0; i < w * h; i += 1) {
    if (seen[i]) continue;
    const x = i % w;
    const near = (x > 0 && seen[i - 1]) || (x < w - 1 && seen[i + 1]) || seen[i - w] || seen[i + w];
    if (near) {
      const light = Math.min(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]);
      if (light > 200) data[i * 4 + 3] = 255 - Math.round(((light - 200) / 55) * 200);
    }
  }
  return sharp(data, { raw: { width: w, height: h, channels: 4 } });
}

await mkdir(OUT, { recursive: true });

let total = 0;
let done = 0;
const waiting = [];
const over = [];

for (const [name, spec] of FILES) {
  const src = path.join(SRC, `${name}.png`);
  const outName = `${name}${spec.suffix ?? ''}`;
  const dest = path.join(OUT, `${outName}.webp`);
  if (!existsSync(src)) {
    waiting.push(name);
    console.log(`변환 대기  ${name}.png 가 아직 없어요`);
    continue;
  }
  let quality = spec.quality;
  let buf;
  for (let attempt = 0; attempt <= 2; attempt += 1) {
    const img = spec.clearBg
      ? await clearWhiteBackground(src, spec.width)
      : sharp(src).resize(spec.width, spec.height, { fit: 'cover' });
    buf = await img.webp({ quality, alphaQuality: 90, effort: 6 }).toBuffer();
    if (buf.length <= spec.maxBytes || attempt === 2) break;
    quality -= 5;
  }
  await writeFile(dest, buf);
  const size = (await stat(dest)).size;
  total += size;
  done += 1;
  if (size > spec.maxBytes) over.push(outName);
  console.log(
    `변환 완료  ${outName}.webp  ${spec.width}x${spec.height}  q${quality}  ${(size / KB).toFixed(1)}KB`,
  );
}

console.log(
  `\n완료 ${done}장 / 대기 ${waiting.length}장 · webp 합계 ${(total / KB).toFixed(1)}KB (상한 1100KB)`,
);
if (over.length) console.log(`상한 초과: ${over.join(', ')}`);
if (total > TOTAL_MAX) console.log('합계가 1100KB 를 넘어요');
if (over.length || total > TOTAL_MAX) process.exitCode = 1;
