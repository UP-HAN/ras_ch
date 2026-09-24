/**
 * 업로드 이미지 제공 (RPT-04, RPT-07, 절대 규칙 8)
 *  - 로그인 필수. 이미지가 속한 게시글을 볼 수 있는 사람만 (본인·같은 반·전교 공개·교사·검토 담당 임원)
 *  - 경로는 yyyy/mm/uuid.webp 형식만 허용(경로 탈출 차단), Cache-Control private
 */
import { Router } from 'express';
import { AppError } from '../lib/apiResponse.js';
import { absoluteImagePath, isValidImageRelPath } from '../lib/image.js';
import { canViewPost, viewerFromAuthUser } from '../lib/postAccess.js';
import { loadUser, loadUserWith, requireAuth, type UserLoader } from '../middleware/auth.js';
import { findImageByPath } from '../repos/postRepo.js';
import { canReviewPost } from '../services/ReviewService.js';
import { canViewImage as canViewCouncilImage } from '../services/CouncilPostService.js';

export function createUploadsRouter(opts: { userLoader?: UserLoader } = {}): Router {
  const router = Router();
  router.use(opts.userLoader ? loadUserWith(opts.userLoader) : loadUser);
  router.use(requireAuth);

  router.get('/:y/:m/:file', async (req, res) => {
    const rel = `${req.params.y}/${req.params.m}/${req.params.file}`;
    if (!isValidImageRelPath(rel)) throw AppError.notFound('사진을 찾을 수 없어요.');
    const user = req.user;
    if (!user) throw AppError.unauthorized();
    const img = await findImageByPath(rel);
    if (!img) {
      // 자치회 글 이미지 (P2-2): 게시·만료 글은 누구나, 승인 전은 임원·교사만
      if (await canViewCouncilImage(user, rel)) {
        res.sendFile(absoluteImagePath(rel), {
          headers: { 'Cache-Control': 'private, max-age=3600', 'Content-Type': 'image/webp' },
          dotfiles: 'deny',
        });
        return;
      }
      throw AppError.notFound('사진을 찾을 수 없어요.');
    }
    // 임원 검토자는 검토 대상(pending, 담당 학년, 본인·같은 반 제외) 글의 이미지만 볼 수 있다 (APR-02c)
    const allowed =
      canViewPost(viewerFromAuthUser(user), img.post) || (await canReviewPost(user, img.post));
    if (!allowed) throw AppError.forbidden('이 사진은 볼 수 없어요.');
    res.sendFile(absoluteImagePath(rel), {
      headers: { 'Cache-Control': 'private, max-age=3600', 'Content-Type': 'image/webp' },
      dotfiles: 'deny',
    });
  });

  return router;
}
