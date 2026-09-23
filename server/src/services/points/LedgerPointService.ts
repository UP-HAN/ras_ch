/**
 * 원장 기반 PointService 구현 (PT-01, PT-02, PT-03, 7.5, 절대 규칙 1)
 *  - 규칙 조회 → 키 계산(KST day/week/month) → cap 별 원장 집계 → checkCaps → INSERT
 *  - 상한은 별도 카운터 없이 원장 집계로만 판단 (재계산 가능)
 *  - 회수는 reversal_of 를 가리키는 음수 행 (같은 rule_code·키·객체 → 그 주차 상한이 다시 열린다)
 *  - 저장소는 인터페이스로 주입해 DB 없이 테스트한다
 */
import type { PoolConnection } from 'mysql2/promise';
import { checkCaps, type CapUsage } from '../../lib/pointCaps.js';
import { dayKey, monthKey, weekKey } from '../../lib/time.js';
import type { LedgerRowFull, NewLedgerRow, UsageQuery } from '../../repos/ledgerRepo.js';
import * as ledgerRepo from '../../repos/ledgerRepo.js';
import { notify } from '../../lib/notify.js';
import type { PointRuleRow } from '../../types/db.js';
import { NOTIFY_RULES, pointsMessage } from './notifyRules.js';
import type {
  LedgerResult,
  PointEvent,
  PointService,
  ReverseOptions,
  ReverseResult,
} from './types.js';

export interface LedgerStore {
  getRule(code: string, conn?: PoolConnection): Promise<PointRuleRow | null>;
  findByEventKey(
    eventKey: string,
    conn?: PoolConnection,
  ): Promise<{ id: number; reversed: boolean } | null>;
  usage(q: UsageQuery, conn?: PoolConnection): Promise<CapUsage>;
  insert(row: NewLedgerRow, conn?: PoolConnection): Promise<number>;
  listReversible(
    refType: string,
    refId: number,
    ruleCodes: string[] | undefined,
    conn?: PoolConnection,
  ): Promise<LedgerRowFull[]>;
  /** 포인트 획득 알림. 테스트에서는 no-op */
  notify(userId: number, message: string, conn?: PoolConnection): Promise<void>;
}

const dbStore: LedgerStore = {
  getRule: (code, conn) => ledgerRepo.getRule(code, conn),
  findByEventKey: (k, conn) => ledgerRepo.findByEventKey(k, conn),
  usage: (q, conn) => ledgerRepo.usage(q, conn),
  insert: (row, conn) => ledgerRepo.insertLedger(row, conn),
  listReversible: (t, id, codes, conn) => ledgerRepo.listReversible(t, id, codes, conn),
  notify: async (userId, message, conn) => {
    await notify(userId, 'points', { message, link: '/me/points' }, conn);
  },
};

export class LedgerPointService implements PointService {
  constructor(private readonly store: LedgerStore = dbStore) {}

  async apply(event: PointEvent, conn?: PoolConnection): Promise<LedgerResult> {
    const rule = await this.store.getRule(event.ruleCode, conn);
    if (!rule) return { granted: false, ledgerId: null, amount: 0, reason: 'NO_RULE' };

    // 멱등: 같은 event_key 로 이미 지급됐으면 DUPLICATE. 단, 그 지급이 회수됐으면(반려 후 재승인 등)
    // 다시 지급할 수 있어야 하므로 키에 세대 번호(#2, #3…)를 붙여 UNIQUE 를 피한다 (PT-03).
    let eventKey = event.eventKey ?? null;
    if (eventKey) {
      let gen = 1;
      let found = await this.store.findByEventKey(eventKey, conn);
      while (found) {
        if (!found.reversed)
          return { granted: false, ledgerId: null, amount: 0, reason: 'DUPLICATE' };
        gen += 1;
        eventKey = `${event.eventKey}#${gen}`;
        found = await this.store.findByEventKey(eventKey, conn);
      }
    }

    const at = event.occurredAt ?? new Date();
    const keys = { dayKey: dayKey(at), weekKey: weekKey(at), monthKey: monthKey(at) };
    const objectType = event.capObject?.type ?? event.refType ?? null;
    const objectId = event.capObject?.id ?? event.refId ?? null;

    const usages: CapUsage[] = [];
    for (const cap of rule.caps) {
      usages.push(
        await this.store.usage(
          {
            ruleCodes: [rule.code, ...(cap.share_codes ?? [])],
            scope: cap.scope,
            by: cap.by === 'granter' ? 'granter' : 'user',
            subjectId: cap.by === 'granter' ? (event.grantedBy ?? 0) : event.userId,
            ...keys,
            objectType,
            objectId,
          },
          conn,
        ),
      );
    }
    const verdict = checkCaps(rule, usages, event.amount);
    if (!verdict.allowed)
      return { granted: false, ledgerId: null, amount: 0, reason: verdict.reason };

    let ledgerId: number;
    try {
      ledgerId = await this.store.insert(
        {
          userId: event.userId,
          ruleCode: rule.code,
          ruleVersion: rule.version,
          amount: verdict.amount,
          refType: event.refType ?? null,
          refId: event.refId ?? null,
          objectType,
          objectId,
          dayKey: keys.dayKey,
          weekKey: keys.weekKey,
          note: event.note ?? null,
          grantedBy: event.grantedBy ?? null,
          reversalOf: null,
          eventKey,
        },
        conn,
      );
    } catch (err) {
      if ((err as { code?: string }).code === 'ER_DUP_ENTRY') {
        return { granted: false, ledgerId: null, amount: 0, reason: 'DUPLICATE' };
      }
      throw err;
    }

    if (NOTIFY_RULES.has(rule.code as PointEvent['ruleCode'])) {
      await this.store.notify(
        event.userId,
        pointsMessage(verdict.amount, rule.name, event.note ?? null),
        conn,
      );
    }
    return { granted: true, ledgerId, amount: verdict.amount };
  }

  async reverse(
    refType: string,
    refId: number,
    opts: ReverseOptions,
    conn?: PoolConnection,
  ): Promise<ReverseResult> {
    const rows = await this.store.listReversible(refType, refId, opts.ruleCodes, conn);
    const reversedLedgerIds: number[] = [];
    let totalAmount = 0;
    for (const row of rows) {
      const id = await this.store.insert(
        {
          userId: row.user_id,
          ruleCode: row.rule_code,
          ruleVersion: row.rule_version,
          amount: -row.amount,
          refType: row.ref_type,
          refId: row.ref_id,
          objectType: row.object_type,
          objectId: row.object_id,
          dayKey: row.day_key,
          weekKey: row.week_key,
          note: opts.note,
          grantedBy: row.granted_by,
          reversalOf: row.id,
          eventKey: null,
        },
        conn,
      );
      reversedLedgerIds.push(id);
      totalAmount += row.amount;
    }
    return { reversedLedgerIds, totalAmount };
  }
}
