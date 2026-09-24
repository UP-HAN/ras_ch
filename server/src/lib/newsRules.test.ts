process.env.SESSION_SECRET = 'test-secret-test-secret';
import { describe, expect, it } from 'vitest';
import {
  closeAtOf,
  DEFAULT_NEWS_SCHEDULE,
  nextWeekSlots,
  slotDays,
  todaySlot,
  topicReactable,
  validateTopicInput,
  voteSummary,
  weekSlots,
} from './newsRules.js';

const S = { ...DEFAULT_NEWS_SCHEDULE };

describe('게시 요일·시각 (NWS-04)', () => {
  it('주당 1개 수요일, 2개 월·수, 3개 월·수·금, 범위 밖은 1~3 으로', () => {
    expect(slotDays(1)).toEqual([3]);
    expect(slotDays(2)).toEqual([1, 3]);
    expect(slotDays(3)).toEqual([1, 3, 5]);
    expect(slotDays(0)).toEqual([3]);
    expect(slotDays(9)).toEqual([1, 3, 5]);
  });
  it('2026-09-24(목) 기준 이번 주 슬롯은 9/23(수) 08:00, 다음 주는 9/30(수)', () => {
    const wk = weekSlots('2026-09-24T12:00:00+09:00', S);
    expect(wk.map((d) => d.format('YYYY-MM-DD HH:mm ddd'))).toEqual(['2026-09-23 08:00 Wed']);
    const next = nextWeekSlots('2026-09-24T12:00:00+09:00', { ...S, perWeek: 3 });
    expect(next.map((d) => d.format('MM-DD'))).toEqual(['09-28', '09-30', '10-02']);
  });
  it('일요일 밤에 계산해도 다음 주는 그다음 월요일부터', () => {
    const next = nextWeekSlots('2026-09-27T20:00:00+09:00', { ...S, perWeek: 2 });
    expect(next.map((d) => d.format('MM-DD'))).toEqual(['09-28', '09-30']);
  });
  it('오늘이 게시 요일이면 오늘 08:00, 아니면 null', () => {
    expect(todaySlot('2026-09-23T09:00:00+09:00', S)?.format('YYYY-MM-DD HH:mm')).toBe(
      '2026-09-23 08:00',
    );
    expect(todaySlot('2026-09-24T09:00:00+09:00', S)).toBeNull();
    expect(todaySlot('2026-09-25T09:00:00+09:00', { ...S, perWeek: 3 })?.format('dd')).toBe('Fr');
  });
  it('마감은 게시 + 7일', () => {
    expect(closeAtOf('2026-09-23T08:00:00+09:00', S).format('YYYY-MM-DD HH:mm')).toBe(
      '2026-09-30 08:00',
    );
  });
});

describe('투표 비율 (NWS-06)', () => {
  it('합이 100, 0표는 0/0', () => {
    expect(voteSummary(2, 1)).toEqual({
      agree: 2,
      disagree: 1,
      total: 3,
      agreePct: 67,
      disagreePct: 33,
    });
    expect(voteSummary(0, 0).agreePct).toBe(0);
  });
  it('반응 가능: live 이고 마감 전', () => {
    expect(topicReactable('live', '2026-09-30 08:00:00', '2026-09-29T00:00:00+09:00')).toBe(true);
    expect(topicReactable('live', '2026-09-30 08:00:00', '2026-09-30T09:00:00+09:00')).toBe(false);
    expect(topicReactable('closed', null)).toBe(false);
    expect(topicReactable('scheduled', null)).toBe(false);
  });
});

describe('주제 입력 검증 (NWS-01)', () => {
  const good = {
    title: '학교에 스마트폰 보관함이 꼭 필요할까?',
    body: '어'.repeat(100),
    type: 'vote',
    questions: ['좋은 점은?', '불편한 점은?'],
    tags: ['폰프리', '학교생활'],
    sourceUrl: '',
  };
  it('정상', () => {
    const r = validateTopicInput(good);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.sourceUrl).toBeNull();
  });
  it('제목 40자 초과·설명 80자 미만·질문 0개·태그 오류·유형 오류·링크 형식', () => {
    expect(validateTopicInput({ ...good, title: '가'.repeat(41) }).ok).toBe(false);
    expect(validateTopicInput({ ...good, body: '짧다' }).ok).toBe(false);
    expect(validateTopicInput({ ...good, questions: [] }).ok).toBe(false);
    expect(validateTopicInput({ ...good, tags: ['정치'] }).ok).toBe(false);
    expect(validateTopicInput({ ...good, type: 'poll' }).ok).toBe(false);
    expect(validateTopicInput({ ...good, sourceUrl: 'ftp://x' }).ok).toBe(false);
    expect(validateTopicInput({ ...good, sourceUrl: 'https://news.example.com/a' }).ok).toBe(true);
  });
});
