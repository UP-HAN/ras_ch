/**
 * 학급 월간 보상 (HOF-02a, 02c) — 순수 함수
 *  - 반별 평균 포인트(미동의 학생 제외한 재적 기준) 1위, 동점이면 참여율 우선
 *  - 같은 반 연속 선정은 넘기고 skippedReason 기록(승인 교사가 예외 허용 가능)
 */
import { SKIP_CONSECUTIVE } from './monthlyTop.js';
import type { ClassMonthInput, ClassRewardResult, PriorWinners } from './types.js';

export function compareClasses(a: ClassMonthInput, b: ClassMonthInput): number {
  return b.avgPoints - a.avgPoints || b.participationRate - a.participationRate;
}

export function rankClasses(
  inputs: ClassMonthInput[],
  prior: PriorWinners,
  allowConsecutiveClass = false,
): ClassRewardResult[] {
  const sorted = [...inputs].sort((a, b) => compareClasses(a, b) || a.classId - b.classId);
  let winnerPicked = false;
  return sorted.map((c, i) => {
    const prev = sorted[i - 1];
    const rank = i > 0 && prev !== undefined && compareClasses(prev, c) === 0 ? i : i + 1;
    let isWinner = false;
    let skippedReason: string | null = null;
    if (!winnerPicked && c.avgPoints > 0) {
      if (prior.winnerClassId === c.classId && !allowConsecutiveClass) {
        skippedReason = SKIP_CONSECUTIVE;
      } else {
        isWinner = true;
        winnerPicked = true;
      }
    }
    return { ...c, rankOverall: rank, isWinner, skippedReason };
  });
}
