/**
 * PWA 아이콘 생성 (CMN-02): client/public/favicon.svg → icons/icon-192.png, icon-512.png, maskable-512.png
 *   npx tsx scripts/gen-icons.mts
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import type SharpModule from 'sharp';

const require = createRequire(import.meta.url);
const sharp = require('sharp') as SharpModule; // workspaces 로 루트에 호이스팅됨

const root = path.resolve(
  path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')),
  '..',
);
const svg = await readFile(path.join(root, 'client/public/favicon.svg'));
const out = path.join(root, 'client/public/icons');
await mkdir(out, { recursive: true });

for (const size of [192, 512]) {
  await writeFile(
    path.join(out, `icon-${size}.png`),
    await sharp(svg).resize(size, size).png().toBuffer(),
  );
}
// maskable: 안전 영역(중앙 80%)에 로고를 두고 배경색으로 채운다
const inner = await sharp(svg).resize(410, 410).png().toBuffer();
await writeFile(
  path.join(out, 'maskable-512.png'),
  await sharp({ create: { width: 512, height: 512, channels: 4, background: '#1e3a5f' } })
    .composite([{ input: inner, gravity: 'centre' }])
    .png()
    .toBuffer(),
);
console.log('icons written to', out);
