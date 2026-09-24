/**
 * 뉴스 토론방 — 학생·임원·교사 (NWS-06, 07, 08, 09, 10, CMN-05)
 *  - 학생: 진행 중 목록(최대 3)·아카이브·상세·투표·의견 댓글(공통 파이프라인)
 *  - 임원: 주제 제안 → 은행 pending
 *  - 교사: 마감 주제의 베스트 의견 선정(학년별 상한, 담당 반만; approver·admin 은 전체)
 */
import { tx } from '../db/query.js';
import { AppError } from '../lib/apiResponse.js';
import { bannedWordMessage, findBannedWords } from '../lib/bannedWords.js';
import {
  DEFAULT_NEWS_SCHEDULE,
  OPINION_HELPERS,
  topicReactable,
  validateTopicInput,
  voteSummary,
  type NewsScheduleSetting,
} from '../lib/newsRules.js';
import { notify } from '../lib/notify.js';
import { isTeacherLike, viewerFromAuthUser } from '../lib/postAccess.js';
import { toCommentView } from '../lib/serializers/comment.js';
import { canAccessClass } from '../middleware/auth.js';
import { hasRole, type AuthUser } from '../types/auth.js';
import { writeAudit } from '../repos/auditRepo.js';
import { listActiveBannedWords } from '../repos/bannedWordRepo.js';
import * as commentRepo from '../repos/commentRepo.js';
import * as newsRepo from '../repos/newsRepo.js';
import { getSetting } from '../repos/settingsRepo.js';
import type {
  CommentView,
  NewsBestResult,
  NewsProposalInput,
  NewsTeacherTopicView,
  NewsTopicCard,
  NewsTopicDetail,
  NewsTopicPage,
  NewsVoteResult,
  NewsVoteSide,
} from '../types/api.js';
import { applyPointsSafe, reversePointsSafe } from './points/safeApply.js';
import * as reactions from './ReactionService.js';

export async function newsSetting(): Promise<NewsScheduleSetting> {
  return {
    ...DEFAULT_NEWS_SCHEDULE,
    ...(await getSetting<Partial<NewsScheduleSetting>>('news_schedule', {})),
  };
}

export function toCard(t: newsRepo.TopicRow, myVote: NewsVoteSide | null): NewsTopicCard {
  return {
    id: t.id,
    title: t.title,
    type: t.type,
    tags: t.tags,
    status: t.status,
    publishAt: t.publish_at ? t.publish_at.toISOString() : null,
    closeAt: t.close_at ? t.close_at.toISOString() : null,
    votes: voteSummary(t.agree_count, t.disagree_count),
    commentCount: t.comment_count,
    myVote,
  };
}

export async function listTopics(
  user: AuthUser,
  status: 'live' | 'closed',
  cursor?: string,
): Promise<NewsTopicPage> {
  const limit = 20;
  const rows =
    status === 'live'
      ? await newsRepo.listLive(3)
      : await newsRepo.listClosed(cursor ? Number(cursor) || null : null, limit + 1);
  const page = rows.slice(0, status === 'live' ? 3 : limit);
  const mine = await newsRepo.myVotes(
    user.row.id,
    page.map((t) => t.id),
  );
  return {
    items: page.map((t) => toCard(t, mine.get(t.id) ?? null)),
    nextCursor:
      status === 'closed' && rows.length > limit ? String(page[page.length - 1]?.id ?? '') : null,
  };
}

/** 홈 카드: 진행 중 최신 1건 (CMN-05) */
export async function latestLive(user: AuthUser): Promise<NewsTopicCard | null> {
  const [t] = await newsRepo.listLive(1);
  if (!t) return null;
  const mine = await newsRepo.myVotes(user.row.id, [t.id]);
  return toCard(t, mine.get(t.id) ?? null);
}

export async function topicDetail(user: AuthUser, id: number): Promise<NewsTopicDetail> {
  const t = await newsRepo.findTopic(id);
  const teacher = isTeacherLike(viewerFromAuthUser(user));
  if (!t || (!teacher && !['live', 'closed'].includes(t.status)))
    throw AppError.notFound('토론 주제를 찾을 수 없어요.');
  const reactable = topicReactable(t.status, t.close_at);
  const mine = await newsRepo.myVotes(user.row.id, [t.id]);
  const rx = ['live', 'closed'].includes(t.status)
    ? await reactions.reactionsFor(user, 'news_topic', t.id)
    : { likedByMe: false, likeCount: 0, comments: [], myCommentCount: 0, goodCommentGuide: '' };
  const bestIds = await newsRepo.bestCommentIds([t.id]);
  return {
    ...toCard(t, mine.get(t.id) ?? null),
    body: t.body,
    questions: t.questions,
    sourceUrl: t.source_url,
    canVote: reactable && t.type === 'vote' && user.row.role === 'student',
    canComment: reactable && user.row.role === 'student',
    helpers: OPINION_HELPERS[t.type],
    reactions: rx,
    bestOpinions: rx.comments.filter((c: CommentView) => bestIds.has(c.id)),
  };
}

/** NWS-06 투표: 마감 전 변경 가능, 포인트는 주제당 1회(NEWS_VOTE per_object) */
export async function vote(
  user: AuthUser,
  id: number,
  side: NewsVoteSide,
): Promise<NewsVoteResult> {
  if (user.row.role !== 'student') throw AppError.forbidden('학생만 투표할 수 있어요.');
  return tx(async (conn) => {
    const t = await newsRepo.findTopic(id, conn, true);
    if (!t || !['live', 'closed'].includes(t.status))
      throw AppError.notFound('토론 주제를 찾을 수 없어요.');
    if (t.type !== 'vote')
      throw AppError.badRequest('자유 의견 주제는 투표가 없어요. 댓글로 생각을 적어 주세요.');
    if (!topicReactable(t.status, t.close_at))
      throw AppError.conflict('마감된 토론이에요. 결과만 볼 수 있어요.');
    await newsRepo.upsertVote(id, user.row.id, side, conn);
    await newsRepo.recountTopic(id, conn);
    const r = await applyPointsSafe(
      {
        ruleCode: 'NEWS_VOTE',
        userId: user.row.id,
        refType: 'news_topic',
        refId: id,
        capObject: { type: 'news_topic', id },
        eventKey: `NEWS_VOTE:news_topic:${id}:u${user.row.id}`,
      },
      conn,
    );
    const after = await newsRepo.findTopic(id, conn);
    return {
      myVote: side,
      votes: voteSummary(after?.agree_count ?? 0, after?.disagree_count ?? 0),
      granted: r.granted,
    };
  });
}

/** 임원 주제 제안 → 은행 pending (금칙어 검사) */
export async function propose(
  user: AuthUser,
  input: NewsProposalInput,
  ip?: string,
): Promise<{ id: number }> {
  if (!hasRole(user, 'council')) throw AppError.forbidden('자치회 임원만 주제를 제안할 수 있어요.');
  const v = validateTopicInput(input);
  if (!v.ok) throw AppError.badRequest(v.message);
  const hits = findBannedWords(
    `${v.value.title} ${v.value.body} ${v.value.questions.join(' ')}`,
    await listActiveBannedWords(),
  );
  if (hits.length > 0) throw AppError.badRequest(bannedWordMessage(hits));
  const id = await newsRepo.insertBank({
    ...v.value,
    status: 'pending',
    proposedBy: user.row.id,
    reviewedBy: null,
    sort: 9999,
  });
  await writeAudit({
    actorId: user.row.id,
    action: 'news.bank.propose',
    targetType: 'news_bank',
    targetId: id,
    ip,
  });
  return { id };
}

// ---------- 교사: 베스트 의견 (NWS-09) ----------

async function teacherTopicView(
  user: AuthUser,
  t: newsRepo.TopicRow,
  setting: NewsScheduleSetting,
): Promise<NewsTeacherTopicView> {
  const comments = await commentRepo.listVisibleByTarget('news_topic', t.id, 500);
  const stances =
    t.type === 'vote'
      ? await newsRepo.votesByUsers(
          t.id,
          comments.map((c) => c.comment.author_id),
        )
      : new Map<number, NewsVoteSide>();
  const best = new Set((await newsRepo.listBest(t.id)).map((b) => b.comment_id));
  const superuser = hasRole(user, 'approver');
  const classCache = new Map<number, boolean>();
  const canSelectClass = async (classId: number | null) => {
    if (superuser) return true;
    if (classId === null) return false;
    if (!classCache.has(classId)) classCache.set(classId, await canAccessClass(user, classId));
    return classCache.get(classId) as boolean;
  };
  const byGrade = new Map<number, NewsTeacherTopicView['grades'][number]['comments']>();
  for (const c of comments) {
    const grade = c.authorClass?.grade ?? 0;
    const list = byGrade.get(grade) ?? [];
    list.push({
      id: c.comment.id,
      body: c.comment.body,
      likeCount: c.comment.like_count,
      authorName: c.author.name,
      className: c.authorClass?.name ?? '',
      studentNo: c.author.student_no,
      grade,
      stance: stances.get(c.comment.author_id) ?? null,
      isBest: best.has(c.comment.id),
      canSelect: await canSelectClass(c.author.class_id),
    });
    byGrade.set(grade, list);
  }
  return {
    id: t.id,
    title: t.title,
    type: t.type,
    closeAt: t.close_at ? t.close_at.toISOString() : null,
    votes: voteSummary(t.agree_count, t.disagree_count),
    bestPerGrade: setting.bestPerGrade,
    grades: [...byGrade.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([grade, list]) => ({
        grade,
        comments: list.sort((a, b) => b.likeCount - a.likeCount || a.id - b.id),
      })),
  };
}

export async function closedTopicsForTeacher(user: AuthUser): Promise<NewsTeacherTopicView[]> {
  const setting = await newsSetting();
  const out: NewsTeacherTopicView[] = [];
  for (const t of await newsRepo.listRecentClosed(12))
    out.push(await teacherTopicView(user, t, setting));
  return out;
}

/**
 * 베스트 의견 저장: 이 교사가 고를 수 있는 댓글(담당 반) 범위 안에서 선택 목록을 통째로 반영한다.
 * 추가 → BEST_OPINION +10P·알림, 해제 → 회수. 학년별 상한 초과 400.
 */
export async function selectBest(
  user: AuthUser,
  topicId: number,
  commentIds: number[],
  ip?: string,
): Promise<NewsBestResult> {
  const setting = await newsSetting();
  const t = await newsRepo.findTopic(topicId);
  if (!t) throw AppError.notFound('토론 주제를 찾을 수 없어요.');
  if (t.status !== 'closed')
    throw AppError.conflict('마감된 토론에서만 베스트 의견을 뽑을 수 있어요.');
  const view = await teacherTopicView(user, t, setting);
  const selectable = new Map(
    view.grades.flatMap((g) =>
      g.comments.filter((c) => c.canSelect).map((c) => [c.id, c] as const),
    ),
  );
  const wanted = new Set(commentIds);
  for (const id of wanted)
    if (!selectable.has(id))
      throw AppError.forbidden('담당 반 학생의 댓글만 베스트로 뽑을 수 있어요.');
  // 학년별 상한: (내 범위 밖의 기존 선정) + (내가 고른 것)
  for (const g of view.grades) {
    const outside = g.comments.filter((c) => !c.canSelect && c.isBest).length;
    const mine = g.comments.filter((c) => c.canSelect && wanted.has(c.id)).length;
    if (outside + mine > setting.bestPerGrade)
      throw AppError.badRequest(
        `${g.grade}학년은 베스트 의견을 ${setting.bestPerGrade}개까지만 뽑을 수 있어요.`,
      );
  }
  let added = 0;
  let removed = 0;
  await tx(async (conn) => {
    for (const c of selectable.values()) {
      const bundle = await commentRepo.findComment(c.id, conn);
      if (!bundle) continue;
      if (wanted.has(c.id) && !c.isBest) {
        await newsRepo.insertBest(
          {
            topicId,
            commentId: c.id,
            userId: bundle.comment.author_id,
            grade: c.grade,
            selectedBy: user.row.id,
          },
          conn,
        );
        await applyPointsSafe(
          {
            ruleCode: 'BEST_OPINION',
            userId: bundle.comment.author_id,
            refType: 'news_best',
            refId: c.id,
            capObject: { type: 'news_topic', id: topicId },
            note: t.title,
            eventKey: `BEST_OPINION:news_best:${c.id}`,
          },
          conn,
        );
        await notify(
          bundle.comment.author_id,
          'award',
          {
            message: `🏅 "${t.title}" 토론에서 내 의견이 베스트 의견으로 뽑혔어요!`,
            link: `/debate/${topicId}`,
          },
          conn,
        );
        added += 1;
      } else if (!wanted.has(c.id) && c.isBest) {
        await newsRepo.deleteBest(c.id, conn);
        await reversePointsSafe(
          'news_best',
          c.id,
          { note: 'news.best.unselect', actorId: user.row.id },
          conn,
        );
        removed += 1;
      }
    }
    await writeAudit(
      {
        actorId: user.row.id,
        action: 'news.best.select',
        targetType: 'news_topic',
        targetId: topicId,
        payload: { added, removed, count: wanted.size },
        ip,
      },
      conn,
    );
  });
  const fresh = await newsRepo.findTopic(topicId);
  return {
    added,
    removed,
    topic: await teacherTopicView(user, fresh as newsRepo.TopicRow, setting),
  };
}

export { toCommentView };
