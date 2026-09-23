/**
 * 업로드 이미지 제공 (RPT-04, RPT-07, 절대 규칙 8)
 *  - 로그인 필수. 이미지가 속한 게시글을 볼 수 있는 사람만 (본인·같은 반·전교 공개·교사)
 *  - 경로는 yyyy/mm/uuid.webp 형식만 허용(경로 탈출 차단), Cache-Control private
 */
import { Router } from 'express';
import { AppError } from '../lib/apiResponse.js';
import { absoluteImagePath, isValidImageRelPath } from '../lib/image.js';
import { canViewPost, viewerFromAuthUser } from '../lib/postAccess.js';
import { loadUser, loadUserWith, requireAuth, type UserLoader } from '../middleware/auth.js';
import { findImageByPath } from '../repos/postRepo.js';

export function createUploadsRouter(opts: { userLoader?: UserLoader } = {}): Router {
  const router = Router();
  router.use(opts.userLoader ? loadUserWith(opts.userLoader) : loadUser);
  router.use(requireAuth);

  router.get('/:y/:m/:file', async (req, res) => {
    const rel = `${req.params.y}/${req.params.m}/${req.params.file}`;
    if (!isValidImageRelPath(rel)) throw AppError.notFound('사진을 찾을 수 없어요.');
    const img = await findImageByPath(rel);
    if (!img) throw AppError.notFound('사진을 찾을 수 없어요.');
    const user = req.user;
    if (!user || !canViewPost(viewerFromAuthUser(user), img.post))
      throw AppError.forbidden('이 사진은 볼 수 없어요.');
    res.sendFile(absoluteImagePath(rel), {
      headers: { 'Cache-Control': 'private, max-age=3600', 'Content-Type': 'image/webp' },
      dotfiles: 'deny',
    });
  });

  return router;
}
