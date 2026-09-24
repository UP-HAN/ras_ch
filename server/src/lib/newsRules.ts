/**
 * 뉴스 토론방 규칙 — 순수 함수 (NWS-01, 04, 05, 06)
 *  - 주당 게시 수 → 게시 요일: 1개면 수요일, 2개면 월·수, 3개면 월·수·금 (사용자 결정 2026-09-24)
 *  - 게시 시각 08:00 KST, 마감 = 게시 + 7일
 *  - 주제 입력 검증: 제목 40자, 설명 80~400자(시드 89~138자), 질문 1~3개, 태그 목록
 */
import type { Dayjs } from 'dayjs';
import { kst, type DateInput } from './time.js';

export interface NewsScheduleSetting {
  perWeek: number;
  hour: number;
  durationDays: number;
  bestPerGrade: number;
  commentsPerTopic: number;
}

export const DEFAULT_NEWS_SCHEDULE: NewsScheduleSetting = {
  perWeek: 1,
  hour: 8,
  durationDays: 7,
  bestPerGrade: 2,
  commentsPerTopic: 3,
};

export const NEWS_TAGS = ['RAS', '폰프리', '미디어', '학교생활', '환경', '과학', '기타'] as const;
export const NEWS_TOPIC_TYPES = ['vote', 'open'] as const;
export type NewsTopicType = (typeof NEWS_TOPIC_TYPES)[number];

export const NEWS_LIMITS = {
  titleMax: 40,
  bodyMin: 80,
  bodyMax: 400,
  questionsMin: 1,
  questionsMax: 3,
  questionMax: 100,
} as const;

/** ISO 요일(1=월 … 7=일). 1개: 수 / 2개: 월·수 / 3개: 월·수·금 */
export function slotDays(perWeek: number): number[] {
  const n = Math.min(3, Math.max(1, Math.floor(perWeek)));
  return n === 1 ? [3] : n === 2 ? [1, 3] : [1, 3, 5];
}

/** 어떤 날이 속한 ISO 주의 게시 시각 목록 */
export function weekSlots(anyDayInWeek: DateInput, s: NewsScheduleSetting): Dayjs[] {
  const monday = kst(anyDayInWeek).startOf('isoWeek');
  return slotDays(s.perWeek).map((d) =>
    monday
      .add(d - 1, 'day')
      .hour(s.hour)
      .minute(0)
      .second(0)
      .millisecond(0),
  );
}

/** 다음 ISO 주의 게시 시각 목록 (일요일 20:00 예약 배치용) */
export function nextWeekSlots(now: DateInput, s: NewsScheduleSetting): Dayjs[] {
  return weekSlots(kst(now).startOf('isoWeek').add(7, 'day'), s);
}

/** 오늘이 게시 요일이면 오늘의 게시 시각, 아니면 null */
export function todaySlot(now: DateInput, s: NewsScheduleSetting): Dayjs | null {
  const d = kst(now);
  return slotDays(s.perWeek).includes(d.isoWeekday())
    ? d.hour(s.hour).minute(0).second(0).millisecond(0)
    : null;
}

export function closeAtOf(publishAt: DateInput, s: NewsScheduleSetting): Dayjs {
  return kst(publishAt).add(s.durationDays, 'day');
}

export interface VoteSummary {
  agree: number;
  disagree: number;
  total: number;
  agreePct: number;
  disagreePct: number;
}

/** 비율은 정수 %, 합이 100 이 되도록 반대 쪽은 100-찬성 */
export function voteSummary(agree: number, disagree: number): VoteSummary {
  const total = agree + disagree;
  if (total === 0) return { agree, disagree, total, agreePct: 0, disagreePct: 0 };
  const agreePct = Math.round((agree / total) * 100);
  return { agree, disagree, total, agreePct, disagreePct: 100 - agreePct };
}

/** 학생이 반응(투표·댓글·좋아요)할 수 있는가: live 이고 마감 전 */
export function topicReactable(
  status: string,
  closeAt: Date | string | null,
  now: DateInput = new Date(),
): boolean {
  if (status !== 'live') return false;
  if (!closeAt) return true;
  return kst(now).isBefore(kst(closeAt));
}

export interface TopicInput {
  title: string;
  body: string;
  type: string;
  questions: string[];
  tags: string[];
  sourceUrl?: string | null;
}

export type TopicValidation =
  | { ok: true; value: Required<TopicInput> & { type: NewsTopicType } }
  | { ok: false; message: string };

export function validateTopicInput(raw: TopicInput): TopicValidation {
  const title = raw.title.trim();
  const body = raw.body.trim();
  const questions = raw.questions.map((q) => q.trim()).filter(Boolean);
  const tags = [...new Set(raw.tags.map((t) => t.trim()).filter(Boolean))];
  const len = (s: string) => Array.from(s).length;
  if (len(title) < 2 || len(title) > NEWS_LIMITS.titleMax)
    return { ok: false, message: `제목은 2~${NEWS_LIMITS.titleMax}자로 적어 주세요.` };
  if (len(body) < NEWS_LIMITS.bodyMin || len(body) > NEWS_LIMITS.bodyMax)
    return {
      ok: false,
      message: `쉬운 설명은 ${NEWS_LIMITS.bodyMin}~${NEWS_LIMITS.bodyMax}자로 적어 주세요.`,
    };
  if (!(NEWS_TOPIC_TYPES as readonly string[]).includes(raw.type))
    return { ok: false, message: '유형은 찬반(vote) 또는 자유(open)예요.' };
  if (questions.length < NEWS_LIMITS.questionsMin || questions.length > NEWS_LIMITS.questionsMax)
    return {
      ok: false,
      message: `생각 열기 질문을 ${NEWS_LIMITS.questionsMin}~${NEWS_LIMITS.questionsMax}개 적어 주세요.`,
    };
  if (questions.some((q) => len(q) > NEWS_LIMITS.questionMax))
    return { ok: false, message: `질문은 ${NEWS_LIMITS.questionMax}자 이하로 적어 주세요.` };
  if (tags.length === 0 || tags.some((t) => !(NEWS_TAGS as readonly string[]).includes(t)))
    return { ok: false, message: '태그를 목록에서 하나 이상 골라 주세요.' };
  const sourceUrl = (raw.sourceUrl ?? '').trim();
  if (sourceUrl && !/^https?:\/\/\S{3,290}$/.test(sourceUrl))
    return { ok: false, message: '출처 링크는 http(s):// 로 시작해야 해요.' };
  return {
    ok: true,
    value: {
      title,
      body,
      type: raw.type as NewsTopicType,
      questions,
      tags,
      sourceUrl: sourceUrl || null,
    },
  };
}

/** NWS-08 문장 도우미 */
export const OPINION_HELPERS: Record<NewsTopicType, string[]> = {
  vote: ['나는 ○○에 찬성해요. 왜냐하면 ', '나는 ○○에 반대해요. 왜냐하면 '],
  open: ['내 생각에는 ', '그 이유는 '],
};
