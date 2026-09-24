/**
 * 자치회 관리 — 임원 지정·해제, 글 승인·반려·고정·숨김 (CNC-03, 04, 07; 승인 권한 교사 approver)
 */
import { AppError } from '../lib/apiResponse.js';
import { notify } from '../lib/notify.js';
import { toDbDateTime } from '../lib/time.js';
import { writeAudit } from '../repos/auditRepo.js';
import * as councilRepo from '../repos/councilRepo.js';
import { findUserById } from '../repos/userRepo.js';
import type { AuthUser } from '../types/auth.js';
import type {
  CouncilAdminPostView,
  CouncilMemberInput,
  CouncilMemberView,
  CouncilPostStatus,
} from '../types/api.js';
import { toAdminView } from './CouncilPostService.js';

function toMemberView(m: councilRepo.CouncilMemberRowFull): CouncilMemberView {
  return {
    id: m.id,
    userId: m.user_id,
    name: m.name,
    displayName: m.display_name,
    className: m.class_name,
    grade: m.grade,
    studentNo: m.student_no,
    title: m.title,
    termStart: m.term_start,
    termEnd: m.term_end,
    isActive: m.is_active === 1,
  };
}

export async function listMembers(): Promise<CouncilMemberView[]> {
  return (await councilRepo.listMembers()).map(toMemberView);
}

export async function addMember(
  actor: AuthUser,
  input: CouncilMemberInput,
  ip?: string,
): Promise<CouncilMemberView> {
  const title = input.title.trim();
  if (title.length < 1 || title.length > 20)
    throw AppError.badRequest('직책은 1~20자로 적어 주세요.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.termStart))
    throw AppError.badRequest('임기 시작일을 YYYY-MM-DD 로 적어 주세요.');
  if (input.termEnd !== null && !/^\d{4}-\d{2}-\d{2}$/.test(input.termEnd))
    throw AppError.badRequest('임기 종료일을 YYYY-MM-DD 로 적어 주세요.');
  if (input.termEnd !== null && input.termEnd < input.termStart)
    throw AppError.badRequest('임기 종료일이 시작일보다 빨라요.');
  const user = await findUserById(input.userId);
  if (!user || user.role !== 'student' || user.status !== 'active')
    throw AppError.badRequest('재학 중인 학생만 임원으로 지정할 수 있어요.');
  if (await councilRepo.findActiveMembership(input.userId))
    throw AppError.conflict('이미 임원으로 지정된 학생이에요.');
  const id = await councilRepo.insertMember({
    userId: input.userId,
    title,
    termStart: input.termStart,
    termEnd: input.termEnd,
  });
  await writeAudit({
    actorId: actor.row.id,
    action: 'council.member.add',
    targetType: 'council_member',
    targetId: id,
    payload: { userId: input.userId, title },
    ip,
  });
  await notify(input.userId, 'council_post', {
    message: `🏫 학생자치회 ${title}(으)로 지정됐어요. 글쓰기에서 자치회 글을 쓸 수 있어요.`,
    link: '/write',
  });
  const m = await councilRepo.findMember(id);
  if (!m) throw AppError.notFound('임원을 찾을 수 없어요.');
  return toMemberView(m);
}

export async function removeMember(actor: AuthUser, id: number, ip?: string): Promise<void> {
  const m = await councilRepo.findMember(id);
  if (!m) throw AppError.notFound('임원을 찾을 수 없어요.');
  if (!(await councilRepo.deactivateMember(id))) throw AppError.conflict('이미 해제된 임원이에요.');
  await writeAudit({
    actorId: actor.row.id,
    action: 'council.member.remove',
    targetType: 'council_member',
    targetId: id,
    payload: { userId: m.user_id },
    ip,
  });
}

// ---------- 글 관리 ----------

export type AdminScope = 'pending' | 'approved' | 'all';

export async function listForAdmin(
  user: AuthUser,
  scope: AdminScope,
): Promise<CouncilAdminPostView[]> {
  const statuses: CouncilPostStatus[] =
    scope === 'pending'
      ? ['pending']
      : scope === 'approved'
        ? ['approved']
        : ['pending', 'approved', 'draft', 'rejected', 'hidden', 'expired'];
  const rows = await councilRepo.listByStatuses(statuses);
  const out: CouncilAdminPostView[] = [];
  for (const b of rows) out.push(await toAdminView(b, user));
  return out;
}

async function load(id: number) {
  const b = await councilRepo.loadBundle(id);
  if (!b) throw AppError.notFound('글을 찾을 수 없어요.');
  return b;
}

export interface ApproveInput {
  isPinned: boolean;
  startsAt?: string;
  endsAt?: string;
}

/** pending → approved. 교사가 고정·기간을 최종 조정한다 (CNC-03, 04) */
export async function approve(
  actor: AuthUser,
  id: number,
  input: ApproveInput,
  ip?: string,
): Promise<CouncilAdminPostView> {
  const b = await load(id);
  if (b.post.status !== 'pending') throw AppError.conflict('검토 대기 중인 글만 승인할 수 있어요.');
  const startsAt = input.startsAt ? new Date(input.startsAt) : b.post.starts_at;
  const endsAt = input.endsAt ? new Date(input.endsAt) : b.post.ends_at;
  if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime()) || endsAt <= startsAt)
    throw AppError.badRequest('게시 기간을 확인해 주세요.');
  await councilRepo.updatePost(id, {
    status: 'approved',
    isPinned: input.isPinned,
    startsAt: toDbDateTime(startsAt),
    endsAt: toDbDateTime(endsAt),
    approvedBy: actor.row.id,
    approvedNow: true,
    rejectReason: null,
  });
  await writeAudit({
    actorId: actor.row.id,
    action: 'council.post.approve',
    targetType: 'council_post',
    targetId: id,
    payload: { isPinned: input.isPinned },
    ip,
  });
  await notify(b.post.author_id, 'council_post', {
    message: `📣 자치회 글 "${b.post.title}"이(가) 게시됐어요.${input.isPinned ? ' 홈 상단에 고정됐어요.' : ''}`,
    link: `/council/${id}`,
  });
  return toAdminView(await load(id), actor);
}

export async function reject(
  actor: AuthUser,
  id: number,
  reason: string,
  ip?: string,
): Promise<CouncilAdminPostView> {
  const b = await load(id);
  if (b.post.status !== 'pending') throw AppError.conflict('검토 대기 중인 글만 반려할 수 있어요.');
  const r = reason.trim();
  if (r.length < 2 || r.length > 200)
    throw AppError.badRequest('반려 이유를 2~200자로 적어 주세요.');
  await councilRepo.updatePost(id, { status: 'rejected', rejectReason: r, isPinned: false });
  await writeAudit({
    actorId: actor.row.id,
    action: 'council.post.reject',
    targetType: 'council_post',
    targetId: id,
    payload: { reason: r },
    ip,
  });
  await notify(b.post.author_id, 'council_post', {
    message: `자치회 글 "${b.post.title}"을(를) 고쳐서 다시 보내 주세요. ${r}`,
    link: `/council/${id}`,
  });
  return toAdminView(await load(id), actor);
}

export async function setPinned(
  actor: AuthUser,
  id: number,
  isPinned: boolean,
  ip?: string,
): Promise<CouncilAdminPostView> {
  const b = await load(id);
  if (b.post.status !== 'approved') throw AppError.conflict('게시 중인 글만 고정할 수 있어요.');
  await councilRepo.updatePost(id, { isPinned });
  await writeAudit({
    actorId: actor.row.id,
    action: isPinned ? 'council.post.pin' : 'council.post.unpin',
    targetType: 'council_post',
    targetId: id,
    ip,
  });
  return toAdminView(await load(id), actor);
}

export async function setHidden(
  actor: AuthUser,
  id: number,
  hidden: boolean,
  ip?: string,
): Promise<CouncilAdminPostView> {
  const b = await load(id);
  if (hidden && b.post.status !== 'approved' && b.post.status !== 'expired')
    throw AppError.conflict('게시된 글만 숨길 수 있어요.');
  if (!hidden && b.post.status !== 'hidden') throw AppError.conflict('숨긴 글이 아니에요.');
  await councilRepo.updatePost(id, {
    status: hidden ? 'hidden' : b.post.ends_at <= new Date() ? 'expired' : 'approved',
    ...(hidden ? { isPinned: false } : {}),
  });
  await writeAudit({
    actorId: actor.row.id,
    action: hidden ? 'council.post.hide' : 'council.post.unhide',
    targetType: 'council_post',
    targetId: id,
    ip,
  });
  if (hidden)
    await notify(b.post.author_id, 'council_post', {
      message: `자치회 글 "${b.post.title}"이(가) 숨겨졌어요. 선생님께 확인해 주세요.`,
      link: `/council/${id}`,
    });
  return toAdminView(await load(id), actor);
}
