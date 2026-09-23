import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// UPLOAD_DIR 을 임시 폴더로 바꾼 뒤 모듈을 불러온다
const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ras-img-'));
process.env.UPLOAD_DIR = tmp;
process.env.SESSION_SECRET = 'test-secret-test-secret';
const img = await import('./image.js');

async function jpegWithExif(width: number, height: number): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: '#f28c28' } })
    .jpeg()
    .withMetadata({ exif: { IFD0: { ImageDescription: 'secret-phone-name', Software: 'test' } } })
    .toBuffer();
}

describe('sniffImageType', () => {
  it('jpg/png/webp 매직 바이트', async () => {
    expect(
      img.sniffImageType(
        await sharp({ create: { width: 4, height: 4, channels: 3, background: '#fff' } })
          .jpeg()
          .toBuffer(),
      ),
    ).toBe('jpeg');
    expect(
      img.sniffImageType(
        await sharp({ create: { width: 4, height: 4, channels: 3, background: '#fff' } })
          .png()
          .toBuffer(),
      ),
    ).toBe('png');
    expect(
      img.sniffImageType(
        await sharp({ create: { width: 4, height: 4, channels: 3, background: '#fff' } })
          .webp()
          .toBuffer(),
      ),
    ).toBe('webp');
  });

  it('그 외(텍스트·gif·pdf)는 null', () => {
    expect(img.sniffImageType(Buffer.from('GIF89a......'))).toBeNull();
    expect(img.sniffImageType(Buffer.from('%PDF-1.4 ..........'))).toBeNull();
    expect(img.sniffImageType(Buffer.from('short'))).toBeNull();
  });
});

// RPT-04: 긴 변 1280px, EXIF 제거
describe('processCapture', () => {
  it('3000×2000 jpg(EXIF 포함) → 1280×853 webp, EXIF 없음', async () => {
    const src = await jpegWithExif(3000, 2000);
    expect((await sharp(src).metadata()).exif).toBeDefined();
    const out = await img.processCapture(src);
    expect(out.width).toBe(1280);
    expect(out.height).toBe(853);
    const meta = await sharp(out.buffer).metadata();
    expect(meta.format).toBe('webp');
    expect(meta.exif).toBeUndefined();
    expect(out.buffer.toString('latin1')).not.toContain('secret-phone-name');
  });

  it('세로 캡처(1080×2400)는 높이 기준 1280 로 줄인다', async () => {
    const out = await img.processCapture(await jpegWithExif(1080, 2400));
    expect(out.height).toBe(1280);
    expect(out.width).toBe(576);
  });

  it('작은 이미지는 키우지 않는다', async () => {
    const out = await img.processCapture(await jpegWithExif(640, 480));
    expect(out.width).toBe(640);
  });

  it('이미지가 아니면 예외', async () => {
    await expect(img.processCapture(Buffer.from('not an image at all'))).rejects.toThrow();
  });
});

describe('saveImage / deleteImage / 경로 검증', () => {
  it('yyyy/mm/uuid.webp 로 저장하고 삭제한다', async () => {
    const out = await img.processCapture(await jpegWithExif(100, 100));
    const rel = await img.saveImage(out, new Date('2026-09-23T10:00:00+09:00'));
    expect(rel).toMatch(/^2026\/09\/[0-9a-f-]{36}\.webp$/);
    const abs = img.absoluteImagePath(rel);
    expect((await fs.stat(abs)).size).toBeGreaterThan(0);
    await img.deleteImage(rel);
    await expect(fs.stat(abs)).rejects.toThrow();
  });

  it('경로 탈출 시도는 거부', () => {
    expect(img.isValidImageRelPath('../../.env')).toBe(false);
    expect(img.isValidImageRelPath('2026/09/x.webp')).toBe(false);
    expect(() => img.absoluteImagePath('2026/09/../../secret.webp')).toThrow();
  });
});

beforeAll(() => undefined);
afterAll(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
});
