/**
 * 학생자치회 게시판 — 임원 작성·공동 편집·제출, 학생 열람·투표 (CNC-01~06)
 *  - 포인트 없음(CNC-06). 댓글·좋아요는 공통 파이프라인(reactionTarget 'council_post', pointsEnabled=false)
 *  - 작성자 표시는 "학생자치회 · 6-1 류○○(회장)" — 학생용 응답에 실명 없음
 */
import { tx } from '../db/query.js';
import { AppError } from '../lib/apiResponse.js';
import { deleteImage } from '../lib/image.js';
import { isTeacherLike, viewerFromAuthUser } from '../lib/postAccess.js';
import { imageUrl } from '../lib/serializers/post.js';
import { toDbDateTime } from '../lib/time.js';
import { hasRole } from '../types/auth.js';
import { validateCouncilInput, COUNCIL_LIMITS } from '../lib/councilRules.js';
export { COUNCIL_LIMITS, COUNCIL_TYPE_LABEL, validateCouncilInput } from '../lib/councilRules.js';
import * as councilRepo from '../repos/councilRepo.js';
import type { AuthUser } from '../types/auth.js';
import type {
  CouncilAdminPostView,
  CouncilPollView,
  CouncilPostCard,
  CouncilPostInput,
  CouncilPostView,
  ImageView,
} from '../types/api.js';
import { processPhotos, type UploadedFile } from './PostService.js';
import { reactionsFor } from './ReactionService.js';

const iso = (d: Date | null) => (d ? d.toISOString() : null);
const isLiveNow = (p: councilRepo.CouncilPostRow, now = new Date()) =>
  p.status === 'approved' && p.starts_at <= now && p.ends_at > now;

function toImageViews(images: councilRepo.CouncilPostImageRow[]): ImageView[] {
  return images.map((img) => ({
    id: img.id,
    kind: 'photo',
    url: imageUrl(img.path),
    width: img.width,
    height: img.height,
  }));
}

export function authorLabel(a: councilRepo.CouncilAuthor): string {
  const title = a.council_title ? `(${a.council_title})` : '';
  return `학생자치회 · ${a.class_name} ${a.display_name}${title}`;
}

export function toCard(b: councilRepo.CouncilPostBundle): CouncilPostCard {
  const { post } = b;
  return {
    id: post.id,
    type: post.type,
    title: post.title,
    status: post.status,
    startsAt: post.starts_at.toISOString(),
    endsAt: post.ends_at.toISOString(),
    isPinned: post.is_pinned === 1,
    isLive: isLiveNow(post),
    likeCount: post.like_count,
    commentCount: post.comment_count,
    authorLabel: authorLabel(b.author),
    thumbnail: b.images[0] ? (toImageViews([b.images[0]])[0] ?? null) : null,
    createdAt: post.created_at.toISOString(),
    approvedAt: iso(post.approved_at),
  };
}

function pollView(
  b: councilRepo.CouncilPostBundle,
  user: AuthUser,
  myOptionId: number | null,
): CouncilPollView | null {
  if (b.post.type !== 'poll') return null;
  const teacher = isTeacherLike(viewerFromAuthUser(user));
  const live = isLiveNow(b.post);
  const ended = b.post.ends_at <= new Date();
  const resultsVisible = teacher || ended || b.post.poll_show_before_close === 1;
  const total = b.options.reduce((a, o) => a + o.vote_count, 0);
  return {
    options: b.options.map((o) => ({
      id: o.id,
      label: o.label,
      votes: resultsVisible ? o.vote_count : null,
    })),
    myOptionId,
    totalVotes: resultsVisible ? total : null,
    showBeforeClose: b.post.poll_show_before_close === 1,
    resultsVisible,
    canVote: live && user.row.role === 'student' && myOptionId === null,
  };
}

function canEditPost(user: AuthUser, post: councilRepo.CouncilPostRow): boolean {
  return (
    hasRole(user, 'council') &&
    (post.status === 'draft' || post.status === 'pending' || post.status === 'rejected')
  );
}

function canSee(user: AuthUser, post: councilRepo.CouncilPostRow): boolean {
  if (isTeacherLike(viewerFromAuthUser(user))) return true;
  if (post.status === 'approved' || post.status === 'expired') return true;
  return hasRole(user, 'council') && post.status !== 'hidden';
}

export async function toView(
  b: councilRepo.CouncilPostBundle,
  user: AuthUser,
): Promise<CouncilPostView> {
  const vote = await councilRepo.findVote(b.post.id, user.row.id);
  const canReact = b.post.status === 'approved' || b.post.status === 'expired';
  return {
    ...toCard(b),
    body: b.post.body,
    images: toImageViews(b.images),
    allowComments: b.post.allow_comments === 1,
    pinRequested: b.post.pin_requested === 1,
    poll: pollView(b, user, vote?.option_id ?? null),
    canEdit: canEditPost(user, b.post),
    rejectReason: b.post.reject_reason,
    reactions: canReact
      ? await reactionsFor(user, 'council_post', b.post.id)
      : {
          likedByMe: false,
          likeCount: b.post.like_count,
          comments: [],
          myCommentCount: 0,
          goodCommentGuide: '',
        },
  };
}

export async function toAdminView(
  b: councilRepo.CouncilPostBundle,
  user: AuthUser,
): Promise<CouncilAdminPostView> {
  return {
    ...(await toView(b, user)),
    authorName: b.author.name,
    authorClassName: b.author.class_name,
    submittedAt: iso(b.post.submitted_at),
    approvedByName: b.approvedByName,
  };
}

export type CouncilListScope = 'live' | 'past' | 'drafts';

export async function listPosts(
  user: AuthUser,
  scope: CouncilListScope,
): Promise<CouncilPostCard[]> {
  if (scope === 'drafts') {
    if (!hasRole(user, 'council') && !isTeacherLike(viewerFromAuthUser(user)))
      throw AppError.forbidden('자치회 임원만 볼 수 있어요.');
    return (await councilRepo.listDrafts()).map(toCard);
  }
  const rows = scope === 'live' ? await councilRepo.listLive() : await councilRepo.listPast();
  return rows.map(toCard);
}

/** 홈 상단 고정 배너 (CNC-04, CMN-05: 공지 다음·토론 카드 앞) 최대 3 */
export async function pinnedForHome(user: AuthUser): Promise<CouncilPostCard[]> {
  void user;
  return (await councilRepo.listPinned(3)).map(toCard);
}

export async function getPost(user: AuthUser, id: number): Promise<CouncilPostView> {
  const b = await councilRepo.loadBundle(id);
  if (!b || !canSee(user, b.post)) throw AppError.notFound('글을 찾을 수 없어요.');
  return toView(b, user);
}

function requireCouncil(user: AuthUser): void {
  if (!hasRole(user, 'council')) throw AppError.forbidden('자치회 임원만 쓸 수 있어요.');
}

export async function createPost(
  user: AuthUser,
  input: CouncilPostInput,
  files: UploadedFile[],
): Promise<CouncilPostView> {
  requireCouncil(user);
  const problem = validateCouncilInput(input);
  if (problem) throw AppError.badRequest(problem);
  const saved = await processPhotos(files, COUNCIL_LIMITS.imagesMax);
  const id = await tx(async (conn) => {
    const postId = await councilRepo.insertPost(
      {
        authorId: user.row.id,
        type: input.type,
        title: input.title.trim(),
        body: input.body.trim(),
        status: input.submit ? 'pending' : 'draft',
        startsAt: toDbDateTime(new Date(input.startsAt)),
        endsAt: toDbDateTime(new Date(input.endsAt)),
        pinRequested: input.pinRequested,
        allowComments: input.allowComments,
        pollShowBeforeClose: input.pollShowBeforeClose,
      },
      conn,
    );
    await councilRepo.replaceImages(postId, saved, conn);
    if (input.type === 'poll')
      await councilRepo.replaceOptions(
        postId,
        input.pollOptions.map((o) => o.trim()).filter(Boolean),
        conn,
      );
    return postId;
  });
  return getPost(user, id);
}

/** 승인 전 임원 누구나 수정 (CNC-05 공동 편집). 새 사진을 올리면 전부 교체 */
export async function updatePost(
  user: AuthUser,
  id: number,
  input: CouncilPostInput,
  files: UploadedFile[],
): Promise<CouncilPostView> {
  requireCouncil(user);
  const problem = validateCouncilInput(input);
  if (problem) throw AppError.badRequest(problem);
  const saved = files.length > 0 ? await processPhotos(files, COUNCIL_LIMITS.imagesMax) : null;
  const removed = await tx(async (conn) => {
    const post = await councilRepo.findPost(id, conn, true);
    if (!post) throw AppError.notFound('글을 찾을 수 없어요.');
    if (!canEditPost(user, post))
      throw AppError.conflict('게시된 글은 고칠 수 없어요. 선생님께 숨김을 부탁해 주세요.');
    if (post.type === 'poll' && (await councilRepo.countVotes(id, conn)) > 0)
      throw AppError.conflict('이미 투표가 시작된 글은 고칠 수 없어요.');
    await councilRepo.updatePost(
      id,
      {
        type: input.type,
        title: input.title.trim(),
        body: input.body.trim(),
        startsAt: toDbDateTime(new Date(input.startsAt)),
        endsAt: toDbDateTime(new Date(input.endsAt)),
        pinRequested: input.pinRequested,
        allowComments: input.allowComments,
        pollShowBeforeClose: input.pollShowBeforeClose,
        ...(input.submit && post.status !== 'pending'
          ? { status: 'pending' as const, submittedNow: true, rejectReason: null }
          : {}),
      },
      conn,
    );
    let old: string[] = [];
    if (saved) old = await councilRepo.replaceImages(id, saved, conn);
    await councilRepo.replaceOptions(
      id,
      input.type === 'poll' ? input.pollOptions.map((o) => o.trim()).filter(Boolean) : [],
      conn,
    );
    return old;
  });
  for (const p of removed) await deleteImage(p);
  return getPost(user, id);
}

/** 초안·반려 → 검토 대기 */
export async function submitPost(user: AuthUser, id: number): Promise<CouncilPostView> {
  requireCouncil(user);
  await tx(async (conn) => {
    const post = await councilRepo.findPost(id, conn, true);
    if (!post) throw AppError.notFound('글을 찾을 수 없어요.');
    if (post.status === 'pending') return;
    if (post.status !== 'draft' && post.status !== 'rejected')
      throw AppError.conflict('지금 상태에서는 보낼 수 없어요.');
    await councilRepo.updatePost(
      id,
      { status: 'pending', submittedNow: true, rejectReason: null },
      conn,
    );
  });
  return getPost(user, id);
}

/** 투표: 1인 1표, 변경 불가, 게시 중일 때만 (CNC-02) */
export async function pollVote(
  user: AuthUser,
  id: number,
  optionId: number,
): Promise<CouncilPollView> {
  if (user.row.role !== 'student') throw AppError.forbidden('학생만 투표할 수 있어요.');
  await tx(async (conn) => {
    const post = await councilRepo.findPost(id, conn, true);
    if (!post || post.type !== 'poll') throw AppError.notFound('투표 글을 찾을 수 없어요.');
    if (!isLiveNow(post)) throw AppError.conflict('지금은 투표할 수 없어요. 투표 기간이 아니에요.');
    const b = await councilRepo.loadBundle(id, conn);
    if (!b || !b.options.some((o) => o.id === optionId))
      throw AppError.badRequest('선택지를 골라 주세요.');
    if (await councilRepo.findVote(id, user.row.id, conn))
      throw AppError.conflict('이미 투표했어요. 투표는 바꿀 수 없어요.');
    await councilRepo.insertVote(id, optionId, user.row.id, conn);
  });
  const b = await councilRepo.loadBundle(id);
  if (!b) throw AppError.notFound('글을 찾을 수 없어요.');
  return pollView(b, user, optionId) as CouncilPollView;
}

/** 업로드 라우트용: 이 사진을 볼 수 있는가 */
export async function canViewImage(user: AuthUser, rel: string): Promise<boolean> {
  const img = await councilRepo.findImageByPath(rel);
  if (!img) return false;
  return canSee(user, img.post);
}
