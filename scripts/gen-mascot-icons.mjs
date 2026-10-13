/**
 * 초롱이 마스코트로 사이트 아이콘·헤더 로고 만들기 (2026-10-13, CMN-02)
 *   node scripts/gen-mascot-icons.mjs [원본 PNG]   (기본: outputs/art/01-mascot-hello.png)
 * 결과: client/public/favicon.png(64), icons/icon-192·512, maskable-512, illustrations/logo-mascot.webp(96)
 */
import console from 'node:console';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const sharp = require('sharp'); // workspaces 로 루트에 호이스팅됨
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.resolve(root, process.argv[2] ?? 'outputs/art/01-mascot-hello.png');
const pub = path.join(root, 'client/public');
await mkdir(path.join(pub, 'icons'), { recursive: true });

// 흰 바탕을 잘라 캐릭터만 남긴다(trim) → 정사각형 투명 여백
const trimmed = await sharp(src).trim({ threshold: 12 }).png().toBuffer();
const square = (size, pad) =>
  sharp(trimmed)
    .resize(Math.round(size * (1 - pad * 2)), Math.round(size * (1 - pad * 2)), {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .extend({
      top: Math.round(size * pad),
      bottom: size - Math.round(size * (1 - pad * 2)) - Math.round(size * pad),
      left: Math.round(size * pad),
      right: size - Math.round(size * (1 - pad * 2)) - Math.round(size * pad),
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    });

await writeFile(path.join(pub, 'favicon.png'), await square(64, 0.02).png().toBuffer());
await writeFile(
  path.join(pub, 'illustrations/logo-mascot.webp'),
  await square(96, 0.02).webp({ quality: 85 }).toBuffer(),
);
for (const size of [192, 512]) {
  // 홈 화면 아이콘: 연한 초록 바탕 위에 초롱이
  const fg = await square(size, 0.08).png().toBuffer();
  await writeFile(
    path.join(pub, `icons/icon-${size}.png`),
    await sharp({ create: { width: size, height: size, channels: 4, background: '#f0fae6' } })
      .composite([{ input: fg }])
      .png({ palette: true, quality: 90 })
      .toBuffer(),
  );
}
// maskable: 안전 영역(중앙 80%) 안에 두고 배경색으로 채운다
const inner = await square(512, 0.16).png().toBuffer();
await writeFile(
  path.join(pub, 'icons/maskable-512.png'),
  await sharp({ create: { width: 512, height: 512, channels: 4, background: '#f0fae6' } })
    .composite([{ input: inner }])
    .png({ palette: true, quality: 90 })
    .toBuffer(),
);
console.log('초롱이 아이콘을 만들었어요:', src);
