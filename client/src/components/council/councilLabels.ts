import type { CouncilPostType } from '@server-types/api';

export const COUNCIL_TYPE: Record<CouncilPostType, { label: string; emoji: string }> = {
  notice: { label: '공지', emoji: '📣' },
  promo: { label: '홍보', emoji: '🎉' },
  poll: { label: '투표', emoji: '🗳️' },
  report: { label: '활동 보고', emoji: '📋' },
};

export const COUNCIL_STATUS: Record<
  string,
  { label: string; tone: 'neutral' | 'info' | 'success' | 'warn' | 'danger' }
> = {
  draft: { label: '임시 저장', tone: 'neutral' },
  pending: { label: '선생님 확인 중', tone: 'info' },
  approved: { label: '게시 중', tone: 'success' },
  rejected: { label: '다시 써 주세요', tone: 'danger' },
  hidden: { label: '숨김', tone: 'warn' },
  expired: { label: '지난 글', tone: 'neutral' },
};
