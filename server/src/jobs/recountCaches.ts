/**
 * 매일 03:00 카운트 재검증 (8.1) + 등급·업적 전원 재계산 (PT-07, 게이미피케이션)
 *  - posts / comments / news_topics / council_posts 의 like_count·comment_count, council_poll_options.vote_count 를 원본 표에서 다시 센다
 *  - 멱등
 */
import { execute } from '../db/query.js';
import { logger } from '../lib/logger.js';
import { evaluateAll } from '../services/AchievementService.js';
import { refreshAllTiers } from '../services/TierService.js';
import { setJobHandler } from './index.js';

export interface RecountResult {
  posts: number;
  comments: number;
  topics: number;
  councilPosts: number;
  pollOptions: number;
  tiersChanged: number;
  achievementsAdded: number;
}

export async function runRecountCaches(): Promise<RecountResult> {
  const posts = await execute(
    `UPDATE posts p SET
       p.like_count = (SELECT COUNT(*) FROM likes l WHERE l.target_type = 'post' AND l.target_id = p.id),
       p.comment_count = (SELECT COUNT(*) FROM comments c WHERE c.target_type = 'post' AND c.target_id = p.id AND c.status = 'visible')`,
  );
  const comments = await execute(
    `UPDATE comments c SET
       c.like_count = (SELECT COUNT(*) FROM likes l WHERE l.target_type = 'comment' AND l.target_id = c.id)`,
  );
  const topics = await execute(
    `UPDATE news_topics t SET
       t.comment_count = (SELECT COUNT(*) FROM comments c WHERE c.target_type = 'news_topic' AND c.target_id = t.id AND c.status = 'visible')`,
  );
  const councilPosts = await execute(
    `UPDATE council_posts cp SET
       cp.like_count = (SELECT COUNT(*) FROM likes l WHERE l.target_type = 'council_post' AND l.target_id = cp.id),
       cp.comment_count = (SELECT COUNT(*) FROM comments c WHERE c.target_type = 'council_post' AND c.target_id = cp.id AND c.status = 'visible')`,
  );
  const pollOptions = await execute(
    `UPDATE council_poll_options o SET
       o.vote_count = (SELECT COUNT(*) FROM council_poll_votes v WHERE v.option_id = o.id)`,
  );
  const tiersChanged = await refreshAllTiers();
  const achievementsAdded = await evaluateAll();
  const result: RecountResult = {
    posts: posts.affectedRows,
    comments: comments.affectedRows,
    topics: topics.affectedRows,
    councilPosts: councilPosts.affectedRows,
    pollOptions: pollOptions.affectedRows,
    tiersChanged,
    achievementsAdded,
  };
  logger.info(result, '카운트 재검증·등급·업적 재계산');
  return result;
}

export function registerRecountCaches(): void {
  setJobHandler('recountCaches', async () => {
    await runRecountCaches();
  });
}
