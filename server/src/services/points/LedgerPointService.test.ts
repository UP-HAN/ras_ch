/**
 * 포인트 엔진 단위 테스트 (13장): 규칙·상한·회수·중복. 메모리 저장소로 DB 없이 돈다.
 */
process.env.SESSION_SECRET = 'test-secret-test-secret';
import { beforeEach, describe, expect, it } from 'vitest';
import type { LedgerRowFull, NewLedgerRow, UsageQuery } from '../../repos/ledgerRepo.js';
import type { PointRuleRow } from '../../types/db.js';
import { LedgerPointService, type LedgerStore } from './LedgerPointService.js';

const RULES: Record<string, PointRuleRow> = {
  REPORT_APPROVED: rule('REPORT_APPROVED', 30, [{ scope: 'week', unit: 'count', max: 1 }]),
  ARTICLE_APPROVED: rule('ARTICLE_APPROVED', 30, [{ scope: 'month', unit: 'count', max: 4 }]),
  COMMENT_WRITTEN: rule('COMMENT_WRITTEN', 3, [
    { scope: 'day', unit: 'count', max: 5, share_codes: ['NEWS_OPINION'] },
  ]),
  NEWS_OPINION: rule('NEWS_OPINION', 3, [
    { scope: 'day', unit: 'count', max: 5, share_codes: ['COMMENT_WRITTEN'] },
  ]),
  LIKE_GIVEN: rule('LIKE_GIVEN', 1, [{ scope: 'day', unit: 'count', max: 10 }]),
  LIKE_RECEIVED_POST: rule('LIKE_RECEIVED_POST', 1, [
    { scope: 'per_object', unit: 'points', max: 20 },
  ]),
  TEACHER_BONUS: {
    ...rule('TEACHER_BONUS', 10, [
      { scope: 'week', unit: 'points', max: 50 },
      { scope: 'week', unit: 'points', max: 300, by: 'granter' },
    ]),
    amount_min: 5,
    amount_max: 20,
  },
  INACTIVE: { ...rule('INACTIVE', 5, []), is_active: 0 },
};

function rule(code: string, amount: number, caps: PointRuleRow['caps']): PointRuleRow {
  return {
    id: 1,
    code,
    name: code,
    amount,
    amount_min: null,
    amount_max: null,
    caps,
    is_active: 1,
    version: 2,
    description: null,
    sort: 0,
  };
}

class MemoryStore implements LedgerStore {
  rows: LedgerRowFull[] = [];
  notices: Array<{ userId: number; message: string }> = [];
  async getRule(code: string) {
    return RULES[code] ?? null;
  }
  async findByEventKey(k: string) {
    const r = this.rows.find((x) => x.event_key === k);
    if (!r) return null;
    return { id: r.id, reversed: this.rows.some((x) => x.reversal_of === r.id) };
  }
  async usage(q: UsageQuery) {
    const rows = this.rows.filter((l) => {
      if (!q.ruleCodes.includes(l.rule_code)) return false;
      if (q.by === 'granter' ? l.granted_by !== q.subjectId : l.user_id !== q.subjectId)
        return false;
      switch (q.scope) {
        case 'day':
          return l.day_key === q.dayKey;
        case 'week':
          return l.week_key === q.weekKey;
        case 'month':
          return l.month_key === q.monthKey;
        default:
          return l.object_type === q.objectType && l.object_id === q.objectId;
      }
    });
    const reversed = new Set(
      this.rows.filter((r) => r.reversal_of !== null).map((r) => r.reversal_of),
    );
    return {
      count: rows.filter((l) => l.amount > 0 && !reversed.has(l.id)).length,
      points: rows.reduce((s, l) => s + l.amount, 0),
    };
  }
  async insert(row: NewLedgerRow) {
    if (row.eventKey && this.rows.some((r) => r.event_key === row.eventKey)) {
      throw Object.assign(new Error('dup'), { code: 'ER_DUP_ENTRY' });
    }
    const id = this.rows.length + 1;
    this.rows.push({
      id,
      user_id: row.userId,
      rule_code: row.ruleCode,
      rule_version: row.ruleVersion,
      amount: row.amount,
      ref_type: row.refType,
      ref_id: row.refId,
      object_type: row.objectType,
      object_id: row.objectId,
      day_key: row.dayKey,
      week_key: row.weekKey,
      month_key: row.dayKey.slice(0, 7),
      note: row.note,
      granted_by: row.grantedBy,
      reversal_of: row.reversalOf,
      event_key: row.eventKey,
      created_at: new Date(),
    });
    return id;
  }
  async listReversible(refType: string, refId: number, ruleCodes?: string[]) {
    const reversed = new Set(
      this.rows.filter((r) => r.reversal_of !== null).map((r) => r.reversal_of),
    );
    return this.rows.filter(
      (l) =>
        l.ref_type === refType &&
        l.ref_id === refId &&
        l.amount > 0 &&
        l.reversal_of === null &&
        !reversed.has(l.id) &&
        (!ruleCodes || ruleCodes.includes(l.rule_code)),
    );
  }
  async notify(userId: number, message: string) {
    this.notices.push({ userId, message });
  }
  net(userId: number) {
    return this.rows.filter((r) => r.user_id === userId).reduce((s, r) => s + r.amount, 0);
  }
}

let store: MemoryStore;
let svc: LedgerPointService;
const MON = new Date('2026-09-21T09:00:00+09:00'); // 2026-W39 월요일
const SUN = new Date('2026-09-27T21:00:00+09:00'); // 같은 주 일요일
const NEXT = new Date('2026-09-28T09:00:00+09:00'); // 2026-W40

beforeEach(() => {
  store = new MemoryStore();
  svc = new LedgerPointService(store);
});

describe('apply — 기본', () => {
  it('규칙 금액을 원장에 기록하고 rule_version·키를 남긴다 (PT-01)', async () => {
    const r = await svc.apply({
      ruleCode: 'REPORT_APPROVED',
      userId: 1,
      refType: 'post',
      refId: 10,
      occurredAt: MON,
      eventKey: 'REPORT_APPROVED:post:10',
    });
    expect(r).toMatchObject({ granted: true, amount: 30 });
    expect(store.rows[0]).toMatchObject({
      user_id: 1,
      rule_code: 'REPORT_APPROVED',
      rule_version: 2,
      amount: 30,
      day_key: '2026-09-21',
      week_key: '2026-W39',
      object_type: 'post',
      object_id: 10,
    });
  });

  it('없는 규칙·비활성 규칙', async () => {
    expect((await svc.apply({ ruleCode: 'NOPE' as never, userId: 1 })).reason).toBe('NO_RULE');
    expect((await svc.apply({ ruleCode: 'INACTIVE' as never, userId: 1 })).reason).toBe(
      'RULE_INACTIVE',
    );
  });

  it('같은 event_key 는 두 번째부터 DUPLICATE (이중 지급 방지)', async () => {
    await svc.apply({
      ruleCode: 'REPORT_APPROVED',
      userId: 1,
      refType: 'post',
      refId: 10,
      occurredAt: MON,
      eventKey: 'k1',
    });
    const r = await svc.apply({
      ruleCode: 'REPORT_APPROVED',
      userId: 1,
      refType: 'post',
      refId: 10,
      occurredAt: MON,
      eventKey: 'k1',
    });
    expect(r.reason).toBe('DUPLICATE');
    expect(store.rows).toHaveLength(1);
  });

  it('알림 대상 규칙만 알림을 만든다 (CMN-03)', async () => {
    await svc.apply({ ruleCode: 'REPORT_APPROVED', userId: 1, occurredAt: MON });
    await svc.apply({
      ruleCode: 'LIKE_GIVEN',
      userId: 1,
      occurredAt: MON,
      refType: 'like',
      refId: 1,
    });
    expect(store.notices).toEqual([{ userId: 1, message: '+30P REPORT_APPROVED' }]);
  });
});

describe('apply — 상한 (PT-02, 7.1)', () => {
  it('주 1회: 같은 주 두 번째 리포트 승인은 거부, 다음 주는 허용', async () => {
    await svc.apply({
      ruleCode: 'REPORT_APPROVED',
      userId: 1,
      refType: 'post',
      refId: 1,
      occurredAt: MON,
    });
    const same = await svc.apply({
      ruleCode: 'REPORT_APPROVED',
      userId: 1,
      refType: 'post',
      refId: 2,
      occurredAt: SUN,
    });
    expect(same.reason).toBe('CAP_REACHED');
    const next = await svc.apply({
      ruleCode: 'REPORT_APPROVED',
      userId: 1,
      refType: 'post',
      refId: 3,
      occurredAt: NEXT,
    });
    expect(next.granted).toBe(true);
  });

  it('월 4회 (기사)', async () => {
    for (let i = 1; i <= 4; i += 1)
      expect(
        (
          await svc.apply({
            ruleCode: 'ARTICLE_APPROVED',
            userId: 1,
            refType: 'post',
            refId: i,
            occurredAt: MON,
          })
        ).granted,
      ).toBe(true);
    expect(
      (
        await svc.apply({
          ruleCode: 'ARTICLE_APPROVED',
          userId: 1,
          refType: 'post',
          refId: 5,
          occurredAt: MON,
        })
      ).reason,
    ).toBe('CAP_REACHED');
  });

  it('일 5회 + 합산(share_codes): 댓글 3 + 토론 의견 2 → 6번째 거부', async () => {
    for (let i = 1; i <= 3; i += 1)
      await svc.apply({
        ruleCode: 'COMMENT_WRITTEN',
        userId: 1,
        refType: 'comment',
        refId: i,
        occurredAt: MON,
      });
    for (let i = 4; i <= 5; i += 1)
      await svc.apply({
        ruleCode: 'NEWS_OPINION',
        userId: 1,
        refType: 'comment',
        refId: i,
        occurredAt: MON,
      });
    expect(
      (
        await svc.apply({
          ruleCode: 'COMMENT_WRITTEN',
          userId: 1,
          refType: 'comment',
          refId: 6,
          occurredAt: MON,
        })
      ).reason,
    ).toBe('CAP_REACHED');
    // 다음 날은 다시 됨
    expect(
      (
        await svc.apply({
          ruleCode: 'COMMENT_WRITTEN',
          userId: 1,
          refType: 'comment',
          refId: 7,
          occurredAt: new Date('2026-09-22T09:00:00+09:00'),
        })
      ).granted,
    ).toBe(true);
  });

  it('게시글당 20P (per_object): ref 는 like 행, 상한 객체는 post', async () => {
    for (let i = 1; i <= 20; i += 1) {
      const r = await svc.apply({
        ruleCode: 'LIKE_RECEIVED_POST',
        userId: 9,
        refType: 'like',
        refId: i,
        capObject: { type: 'post', id: 77 },
        occurredAt: MON,
      });
      expect(r.granted).toBe(true);
    }
    expect(
      (
        await svc.apply({
          ruleCode: 'LIKE_RECEIVED_POST',
          userId: 9,
          refType: 'like',
          refId: 21,
          capObject: { type: 'post', id: 77 },
          occurredAt: MON,
        })
      ).reason,
    ).toBe('CAP_REACHED');
    // 다른 글이면 됨
    expect(
      (
        await svc.apply({
          ruleCode: 'LIKE_RECEIVED_POST',
          userId: 9,
          refType: 'like',
          refId: 22,
          capObject: { type: 'post', id: 78 },
          occurredAt: MON,
        })
      ).granted,
    ).toBe(true);
  });

  it('교사 칭찬: 범위형 금액, 학생 주 50 + 교사 주 300 (granter)', async () => {
    const bonus = (student: number, teacher: number, amount: number) =>
      svc.apply({
        ruleCode: 'TEACHER_BONUS',
        userId: student,
        grantedBy: teacher,
        amount,
        occurredAt: MON,
        note: '잘했어요',
      });
    expect((await bonus(1, 100, 20)).amount).toBe(20);
    expect((await bonus(1, 100, 20)).amount).toBe(20);
    expect((await bonus(1, 100, 20)).amount).toBe(10); // 잔여 10만
    expect((await bonus(1, 100, 5)).reason).toBe('CAP_REACHED');
    expect((await bonus(1, 100, 25)).reason).toBe('AMOUNT_OUT_OF_RANGE');
    // 교사 주 300: 이미 50 지급 → 12명 × 20 = 240 (누적 290) → 13번째는 잔여 10만 → 14번째 거부
    for (let s = 2; s <= 13; s += 1) expect((await bonus(s, 100, 20)).amount).toBe(20);
    expect((await bonus(14, 100, 20)).amount).toBe(10);
    expect((await bonus(15, 100, 20)).reason).toBe('CAP_REACHED');
    // 다른 교사는 됨
    expect((await bonus(17, 200, 20)).granted).toBe(true);
  });
});

describe('reverse (PT-03)', () => {
  it('회수된 지급은 같은 event_key 로 다시 지급할 수 있다 (반려 후 재승인)', async () => {
    const ev = {
      ruleCode: 'REPORT_APPROVED' as const,
      userId: 1,
      refType: 'post',
      refId: 10,
      occurredAt: MON,
      eventKey: 'REPORT_APPROVED:post:10',
    };
    expect((await svc.apply(ev)).granted).toBe(true);
    expect((await svc.apply(ev)).reason).toBe('DUPLICATE');
    await svc.reverse('post', 10, { note: 'reject' });
    const again = await svc.apply(ev);
    expect(again.granted).toBe(true);
    expect(store.rows[(again.ledgerId as number) - 1]?.event_key).toBe('REPORT_APPROVED:post:10#2');
    expect((await svc.apply(ev)).reason).toBe('DUPLICATE');
    expect(store.net(1)).toBe(30);
  });

  it('근거 객체로 지급된 행마다 음수 행을 만들고 합계가 0이 된다', async () => {
    await svc.apply({
      ruleCode: 'REPORT_APPROVED',
      userId: 1,
      refType: 'post',
      refId: 10,
      occurredAt: MON,
    });
    await svc.apply({
      ruleCode: 'ARTICLE_APPROVED',
      userId: 1,
      refType: 'post',
      refId: 10,
      occurredAt: MON,
    });
    const r = await svc.reverse('post', 10, { note: 'post.reject' });
    expect(r.reversedLedgerIds).toHaveLength(2);
    expect(r.totalAmount).toBe(60);
    expect(store.net(1)).toBe(0);
    expect(store.rows[2]).toMatchObject({
      amount: -30,
      reversal_of: 1,
      rule_code: 'REPORT_APPROVED',
      week_key: '2026-W39',
      event_key: null,
    });
  });

  it('회수하면 그 주차 상한이 다시 열린다', async () => {
    await svc.apply({
      ruleCode: 'REPORT_APPROVED',
      userId: 1,
      refType: 'post',
      refId: 10,
      occurredAt: MON,
    });
    expect(
      (
        await svc.apply({
          ruleCode: 'REPORT_APPROVED',
          userId: 1,
          refType: 'post',
          refId: 11,
          occurredAt: SUN,
        })
      ).reason,
    ).toBe('CAP_REACHED');
    await svc.reverse('post', 10, { note: 'reject' });
    expect(
      (
        await svc.apply({
          ruleCode: 'REPORT_APPROVED',
          userId: 1,
          refType: 'post',
          refId: 11,
          occurredAt: SUN,
        })
      ).granted,
    ).toBe(true);
  });

  it('두 번 회수해도 한 번만 (이미 회수된 행은 제외)', async () => {
    await svc.apply({
      ruleCode: 'REPORT_APPROVED',
      userId: 1,
      refType: 'post',
      refId: 10,
      occurredAt: MON,
    });
    await svc.reverse('post', 10, { note: 'a' });
    const r = await svc.reverse('post', 10, { note: 'b' });
    expect(r.reversedLedgerIds).toHaveLength(0);
    expect(store.net(1)).toBe(0);
  });

  it('ruleCodes 로 일부만 회수', async () => {
    await svc.apply({
      ruleCode: 'REPORT_APPROVED',
      userId: 1,
      refType: 'post',
      refId: 10,
      occurredAt: MON,
    });
    await svc.apply({
      ruleCode: 'ARTICLE_APPROVED',
      userId: 1,
      refType: 'post',
      refId: 10,
      occurredAt: MON,
    });
    await svc.reverse('post', 10, { note: 'x', ruleCodes: ['ARTICLE_APPROVED'] });
    expect(store.net(1)).toBe(30);
  });
});
