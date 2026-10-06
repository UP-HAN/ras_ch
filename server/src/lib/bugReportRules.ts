/**
 * 버그 신고 규칙 (BUG-01, BUG-03, BUG-05) — 순수 상수·검증. DB 접근 없음.
 */
import { AppError } from './apiResponse.js';

export const BUG_STATUSES = ['received', 'checking', 'resolved', 'held'] as const;
export type BugStatus = (typeof BUG_STATUSES)[number];

/** 교사·관리자 화면 문구. 학생 화면 문구는 클라이언트에서 쉬운 말로 따로 보여 준다 */
export const BUG_STATUS_LABEL: Record<BugStatus, string> = {
  received: '받음',
  checking: '확인 중',
  resolved: '해결',
  held: '보류',
};

/** 아직 처리가 남은 상태 (관리자 메뉴 배지) */
export const BUG_OPEN_STATUSES: BugStatus[] = ['received', 'checking'];

export const BUG_LIMITS = {
  titleMin: 2,
  titleMax: 100,
  bodyMin: 5,
  bodyMax: 2000,
  replyMax: 2000,
  pagePathMax: 200,
  /** 한 사람이 하루에 보낼 수 있는 수 (BUG-01 도배 방지) */
  perDayMax: 5,
} as const;

export function isBugStatus(v: unknown): v is BugStatus {
  return typeof v === 'string' && (BUG_STATUSES as readonly string[]).includes(v);
}

const charLen = (s: string): number => Array.from(s).length;

export interface BugInput {
  title: string;
  body: string;
  pagePath: string | null;
}

/**
 * 신고 입력 검증 (BUG-01). 문구는 초등 3학년이 읽을 수 있게 쓴다.
 * 길이는 글자 수(코드 포인트) 기준 — 이모지·한글을 한 글자로 센다.
 */
export function validateBugInput(input: BugInput): BugInput {
  const title = input.title.trim();
  const body = input.body.trim();
  if (charLen(title) < BUG_LIMITS.titleMin || charLen(title) > BUG_LIMITS.titleMax)
    throw AppError.badRequest(
      `제목을 ${BUG_LIMITS.titleMin}~${BUG_LIMITS.titleMax}자로 적어 주세요.`,
    );
  if (charLen(body) < BUG_LIMITS.bodyMin || charLen(body) > BUG_LIMITS.bodyMax)
    throw AppError.badRequest(
      `내용을 ${BUG_LIMITS.bodyMin}~${BUG_LIMITS.bodyMax}자로 적어 주세요. 어떤 화면에서 무엇을 했는지 적어 주시면 좋아요.`,
    );
  return { title, body, pagePath: normalizePagePath(input.pagePath) };
}

/** 관리자 답변 검증 (BUG-03) */
export function validateReply(reply: string | null): string | null {
  if (reply === null) return null;
  const v = reply.trim();
  if (v === '') return null;
  if (charLen(v) > BUG_LIMITS.replyMax)
    throw AppError.badRequest(`답변은 ${BUG_LIMITS.replyMax}자 이하로 적어 주세요.`);
  return v;
}

/**
 * 화면 경로 정리 (BUG-01, BUG-05).
 * 앱 내부 경로만 받는다 — 외부 URL(`//evil.com`, `http:` 등)과 따옴표·꺾쇠는 전부 버린다.
 * 조건에 맞지 않으면 예외가 아니라 null (경로는 부가 정보일 뿐, 신고를 막지 않는다).
 */
export function normalizePagePath(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string') return null;
  const v = raw.trim();
  if (v === '' || v.length > BUG_LIMITS.pagePathMax) return null;
  if (!v.startsWith('/') || v.startsWith('//')) return null;
  return /^\/[A-Za-z0-9/_:?=&.-]*$/.test(v) ? v : null;
}

export interface ReportViewer {
  id: number;
  isAdmin: boolean;
}

/** 열람 권한 (BUG-02, BUG-05): 신고자 본인 또는 관리자만 */
export function canViewReport(viewer: ReportViewer, reporterId: number): boolean {
  return viewer.isAdmin || viewer.id === reporterId;
}
