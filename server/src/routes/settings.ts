import { Router } from 'express';
import { env } from '../config/env.js';
import { ok } from '../lib/apiResponse.js';
import { requireAuth } from '../middleware/auth.js';
import { getSetting } from '../repos/settingsRepo.js';
import type { PublicSettingsView } from '../types/api.js';

/** 학생·교사 모두 읽는 안내 문구·한도 (RPT-05 캡처 안내, RCT-07 좋은 댓글 기준) */
export function createSettingsRouter(): Router {
  const router = Router();
  router.use(requireAuth);

  router.get('/public', async (_req, res) => {
    const data: PublicSettingsView = {
      captureGuide: await getSetting('capture_guide', {
        android_samsung: '설정 > 디지털 웰빙 > 주간 리포트 화면 두 장을 캡처해요.',
        iphone: '설정 > 스크린 타임 > 모든 활동 보기 > 주 화면을 캡처해요.',
        warning: '이름이나 프로필, 알림, 메시지가 보이는 화면은 캡처하지 마세요.',
      }),
      reportText: await getSetting('report_text', {
        reflection_min: 100,
        reflection_max: 1000,
        goal_max: 100,
      }),
      goodCommentGuide: await getSetting('good_comment_guide', ''),
      demoMode: env.DEMO_MODE === '1',
      demoSiteUrl: env.DEMO_SITE_URL ?? null,
    };
    res.json(ok(data));
  });

  return router;
}
