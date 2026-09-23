/**
 * 캡처 이미지 처리 (RPT-02, RPT-04, 절대 규칙 8)
 *  - 매직 바이트로 jpg/png/webp 만 허용
 *  - sharp: EXIF 방향 반영 후 긴 변 1280px 로 축소, 메타데이터(EXIF·GPS) 제거, webp 저장
 *  - 원본은 저장하지 않고 리사이즈본만 UPLOAD_DIR/yyyy/mm/{uuid}.webp 에 둔다. DB에는 상대 경로만
 */
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { env } from '../config/env.js';
import { kst } from './time.js';

export type ImageType = 'jpeg' | 'png' | 'webp';
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_EDGE = 1280;
export const WEBP_QUALITY = 82;

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(here, '../../..');

/** UPLOAD_DIR 이 상대 경로면 리포 루트 기준 (server/ 에서 실행돼도 같은 곳) */
export function uploadRoot(): string {
  return path.isAbsolute(env.UPLOAD_DIR) ? env.UPLOAD_DIR : path.resolve(REPO_ROOT, env.UPLOAD_DIR);
}

export function sniffImageType(buf: Uint8Array): ImageType | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpeg';
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'png';
  const riff = String.fromCharCode(
    buf[0] as number,
    buf[1] as number,
    buf[2] as number,
    buf[3] as number,
  );
  const webp = String.fromCharCode(
    buf[8] as number,
    buf[9] as number,
    buf[10] as number,
    buf[11] as number,
  );
  if (riff === 'RIFF' && webp === 'WEBP') return 'webp';
  return null;
}

export interface ProcessedImage {
  buffer: Buffer;
  width: number;
  height: number;
}

/** 리사이즈 + 메타데이터 제거 + webp. sharp 는 withMetadata() 를 부르지 않으면 EXIF 를 버린다 */
export async function processCapture(input: Uint8Array): Promise<ProcessedImage> {
  const { data, info } = await sharp(input, { failOn: 'error', limitInputPixels: 50_000_000 })
    .rotate() // EXIF 방향을 픽셀에 반영한 뒤 EXIF 는 제거
    .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: WEBP_QUALITY })
    .toBuffer({ resolveWithObject: true });
  return { buffer: data, width: info.width, height: info.height };
}

const REL_PATH_RE = /^\d{4}\/\d{2}\/[0-9a-f-]{36}\.webp$/;

export function isValidImageRelPath(rel: string): boolean {
  return REL_PATH_RE.test(rel);
}

export function absoluteImagePath(rel: string): string {
  if (!isValidImageRelPath(rel)) throw new Error('잘못된 이미지 경로');
  return path.join(uploadRoot(), rel);
}

/** 저장 후 상대 경로("2026/09/uuid.webp") 반환 */
export async function saveImage(
  processed: ProcessedImage,
  now: Date = new Date(),
): Promise<string> {
  const d = kst(now);
  const rel = `${d.format('YYYY')}/${d.format('MM')}/${randomUUID()}.webp`;
  const abs = path.join(uploadRoot(), rel);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, processed.buffer);
  return rel;
}

export async function deleteImage(rel: string): Promise<void> {
  if (!isValidImageRelPath(rel)) return;
  try {
    await fs.unlink(path.join(uploadRoot(), rel));
  } catch {
    // 이미 없으면 무시
  }
}
