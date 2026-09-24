/**
 * 3부문 후보 점수 (HOF-04, 08, 7.2~7.4) — 순수 함수. 근거(breakdown)를 함께 돌려준다.
 *  7.2 폰프리 실천왕: 자격 승인 리포트 3건+ / 성실성 + 변화(최대 40) + 성찰 + 공감(최대 20)
 *  7.3 RAS 기자     : 자격 기사 1건+ / 기사 수×10(최대 40) + 엄지척 합(최대 40) + 댓글 합(최대 20) + 추천 +20
 *  7.4 참여왕       : 자격 리포트·기사 승인 0~1건 / 댓글×3(60) + 좋아요 누름×1(30) + 댓글 받은 좋아요×2(30)
 *                     + 토론 투표×2(20, 2차) + 베스트 의견×10(20, 2차) + 출석×1(25) + 읽은 글×0.5(20) + 설문×5(15, 3차)
 */
import { assignRanks } from './monthlyTop.js';
import {
  AWARD_CATEGORIES,
  type AwardCandidate,
  type AwardCategory,
  type AwardStudentInput,
} from './types.js';

export interface Scored {
  score: number;
  breakdown: Record<string, number>;
}

const cap = (v: number, max: number) => Math.min(max, Math.max(0, v));

export function scorePhonefree(i: AwardStudentInput): Scored | null {
  if (i.reportCount < 3) return null;
  const diligence = i.reportCount * 10;
  let change = 0;
  if (i.firstReportMinutes !== null && i.lastReportMinutes !== null && i.firstReportMinutes > 0) {
    change = cap(
      Math.round(((i.firstReportMinutes - i.lastReportMinutes) / i.firstReportMinutes) * 100),
      40,
    );
  }
  const reflection = i.teacherScore === null ? 20 : Math.round(i.teacherScore * 10);
  const empathy = cap(i.reportReactions, 20);
  return {
    score: diligence + change + reflection + empathy,
    breakdown: { 성실성: diligence, 변화: change, 성찰: reflection, 공감: empathy },
  };
}

export function scoreReporter(i: AwardStudentInput): Scored | null {
  if (i.articleCount < 1) return null;
  const count = cap(i.articleCount * 10, 40);
  const likes = cap(i.articleLikes, 40);
  const comments = cap(i.articleComments, 20);
  const featured = i.featuredCount > 0 ? 20 : 0;
  return {
    score: count + likes + comments + featured,
    breakdown: { 기사수: count, 엄지척: likes, 댓글: comments, 추천기사: featured },
  };
}

export function scoreParticipation(i: AwardStudentInput): Scored | null {
  if (i.reportCount + i.articleCount > 1) return null;
  const comments = cap(i.commentsWritten * 3, 60);
  const likesGiven = cap(i.likesGiven, 30);
  const commentLikes = cap(i.commentLikesReceived * 2, 30);
  const attendance = cap(i.attendanceDays, 25);
  const reads = cap(i.readCount * 0.5, 20);
  const votes = cap(i.newsVoteTopics * 2, 20);
  const best = cap(i.bestOpinions * 10, 20);
  return {
    score: comments + likesGiven + commentLikes + votes + best + attendance + reads,
    breakdown: {
      댓글: comments,
      좋아요누름: likesGiven,
      댓글좋아요: commentLikes,
      토론투표: votes,
      베스트의견: best,
      출석: attendance,
      읽기: reads,
    },
  };
}

const SCORERS: Record<AwardCategory, (i: AwardStudentInput) => Scored | null> = {
  phonefree: scorePhonefree,
  reporter: scoreReporter,
  participation: scoreParticipation,
};

export const CATEGORY_LABEL: Record<AwardCategory | 'growth', string> = {
  phonefree: '이 달의 폰프리 실천왕',
  reporter: '이 달의 RAS 기자',
  participation: '이 달의 참여왕',
  growth: '성장률 부문',
};

/** 부문별·학년별 상위 N 후보. 점수 0 은 제외. 다른 부문에도 후보인 학생은 warnings 표시(HOF-08) */
export function rankAwards(inputs: AwardStudentInput[], perGrade = 5): AwardCandidate[] {
  const out: AwardCandidate[] = [];
  const grades = [...new Set(inputs.map((s) => s.grade))].sort((a, b) => a - b);
  for (const category of AWARD_CATEGORIES) {
    const scorer = SCORERS[category];
    for (const grade of grades) {
      const scored = inputs
        .filter((s) => s.grade === grade)
        .map((s) => ({ s, r: scorer(s) }))
        .filter((x): x is { s: AwardStudentInput; r: Scored } => x.r !== null && x.r.score > 0)
        .sort((a, b) => b.r.score - a.r.score || a.s.userId - b.s.userId);
      const ranks = assignRanks(scored, (a, b) => b.r.score - a.r.score);
      scored.forEach((x, i) => {
        const rank = ranks[i] as number;
        if (rank > perGrade) return;
        out.push({
          category,
          userId: x.s.userId,
          grade,
          score: x.r.score,
          breakdown: x.r.breakdown,
          rankInGrade: rank,
          warnings: [],
        });
      });
    }
  }
  // HOF-08: 같은 학생이 여러 부문 후보
  const byUser = new Map<number, AwardCandidate[]>();
  for (const c of out) byUser.set(c.userId, [...(byUser.get(c.userId) ?? []), c]);
  for (const list of byUser.values()) {
    if (list.length < 2) continue;
    for (const c of list) {
      const others = list.filter((o) => o !== c).map((o) => CATEGORY_LABEL[o.category]);
      c.warnings.push(`${others.join(', ')} 후보이기도 해요 (분산 선정 권장)`);
    }
  }
  return out;
}
