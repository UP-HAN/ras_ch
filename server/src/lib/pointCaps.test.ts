import { describe, expect, it } from 'vitest';
import { capKey, checkCaps, resolveAmount, type RuleForCaps } from './pointCaps.js';

const rule = (over: Partial<RuleForCaps>): RuleForCaps => ({
  code: 'COMMENT_WRITTEN',
  amount: 3,
  amount_min: null,
  amount_max: null,
  caps: [{ scope: 'day', unit: 'count', max: 5 }],
  is_active: 1,
  ...over,
});

// PT-02, 7.1: 상한은 원장 집계값만 보고 판단하는 순수 함수
describe('checkCaps — count 단위', () => {
  it('상한 미만이면 정액 지급', () => {
    expect(checkCaps(rule({}), [{ count: 4, points: 12 }])).toEqual({ allowed: true, amount: 3 });
  });

  it('상한에 도달하면 거부', () => {
    expect(checkCaps(rule({}), [{ count: 5, points: 15 }])).toMatchObject({
      allowed: false,
      reason: 'CAP_REACHED',
      capIndex: 0,
    });
  });

  it('비활성 규칙은 거부', () => {
    expect(checkCaps(rule({ is_active: 0 }), [])).toMatchObject({
      allowed: false,
      reason: 'RULE_INACTIVE',
    });
  });

  it('usage 가 없으면 0으로 본다', () => {
    expect(checkCaps(rule({}), []).allowed).toBe(true);
  });
});

describe('checkCaps — points 단위 (게시글당 20P 등)', () => {
  const likeReceived = rule({
    code: 'LIKE_RECEIVED_POST',
    amount: 1,
    caps: [{ scope: 'per_object', unit: 'points', max: 20 }],
  });

  it('잔여 포인트가 있으면 지급', () => {
    expect(checkCaps(likeReceived, [{ count: 19, points: 19 }])).toEqual({
      allowed: true,
      amount: 1,
    });
  });

  it('잔여가 0이면 거부', () => {
    expect(checkCaps(likeReceived, [{ count: 20, points: 20 }]).allowed).toBe(false);
  });

  it('잔여보다 큰 금액은 잔여만큼만 지급 (교사 칭찬 주 50P 한도)', () => {
    const bonus = rule({
      code: 'TEACHER_BONUS',
      amount: 10,
      amount_min: 5,
      amount_max: 20,
      caps: [
        { scope: 'week', unit: 'points', max: 50 },
        { scope: 'week', unit: 'points', max: 300, by: 'granter' },
      ],
    });
    const r = checkCaps(
      bonus,
      [
        { count: 3, points: 45 },
        { count: 10, points: 100 },
      ],
      20,
    );
    expect(r).toEqual({ allowed: true, amount: 5 });
  });

  it('두 cap 중 하나라도 걸리면 거부 (교사당 주 300P)', () => {
    const bonus = rule({
      code: 'TEACHER_BONUS',
      amount: 10,
      amount_min: 5,
      amount_max: 20,
      caps: [
        { scope: 'week', unit: 'points', max: 50 },
        { scope: 'week', unit: 'points', max: 300, by: 'granter' },
      ],
    });
    expect(
      checkCaps(
        bonus,
        [
          { count: 0, points: 0 },
          { count: 30, points: 300 },
        ],
        10,
      ),
    ).toMatchObject({
      allowed: false,
      capIndex: 1,
    });
  });
});

describe('resolveAmount — 범위형 규칙', () => {
  const bonus = rule({ amount: 10, amount_min: 5, amount_max: 20, caps: [] });

  it('요청 금액이 범위 안이면 그대로', () => {
    expect(resolveAmount(bonus, 15)).toBe(15);
  });

  it('범위 밖이면 null → 거부', () => {
    expect(resolveAmount(bonus, 25)).toBeNull();
    expect(checkCaps(bonus, [], 3)).toMatchObject({
      allowed: false,
      reason: 'AMOUNT_OUT_OF_RANGE',
    });
  });

  it('요청이 없으면 기본 금액', () => {
    expect(resolveAmount(bonus)).toBe(10);
  });
});

describe('capKey — 합산 규칙(share_codes)은 코드 순서와 무관하게 같은 키', () => {
  it('COMMENT_WRITTEN + NEWS_OPINION', () => {
    const a = capKey('COMMENT_WRITTEN', {
      scope: 'day',
      unit: 'count',
      max: 5,
      share_codes: ['NEWS_OPINION'],
    });
    const b = capKey('NEWS_OPINION', {
      scope: 'day',
      unit: 'count',
      max: 5,
      share_codes: ['COMMENT_WRITTEN'],
    });
    expect(a).toBe(b);
    expect(a).toBe('COMMENT_WRITTEN+NEWS_OPINION|day|count|user');
  });
});
