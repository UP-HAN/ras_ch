/**
 * 이번 주 미션(개인)·학급 미션 — 순수 함수. 포인트 추가 지급 없음(진행률·축하만).
 */
export interface WeeklyActivity {
  reportSubmitted: boolean;
  commentsThisWeek: number;
  likesGivenThisWeek: number;
  debateActionsThisWeek: number;
  /** 이번 주에 진행 중인 토론이 있는가 (없으면 토론 미션을 엄지척 미션으로 대체) */
  debateAvailable: boolean;
}

export interface MissionItem {
  code: 'report' | 'comment' | 'debate' | 'likes';
  emoji: string;
  label: string;
  current: number;
  target: number;
  done: boolean;
}

export function buildMissions(a: WeeklyActivity): MissionItem[] {
  const items: MissionItem[] = [
    {
      code: 'report',
      emoji: '📝',
      label: '이번 주 리포트 올리기',
      current: a.reportSubmitted ? 1 : 0,
      target: 1,
      done: a.reportSubmitted,
    },
    {
      code: 'comment',
      emoji: '💌',
      label: '친구 글 읽고 응원 댓글 1개',
      current: Math.min(a.commentsThisWeek, 1),
      target: 1,
      done: a.commentsThisWeek >= 1,
    },
  ];
  if (a.debateAvailable) {
    items.push({
      code: 'debate',
      emoji: '💬',
      label: '토론에 투표하거나 의견 쓰기',
      current: Math.min(a.debateActionsThisWeek, 1),
      target: 1,
      done: a.debateActionsThisWeek >= 1,
    });
  } else {
    items.push({
      code: 'likes',
      emoji: '👍',
      label: '친구 글에 엄지척 3개',
      current: Math.min(a.likesGivenThisWeek, 3),
      target: 3,
      done: a.likesGivenThisWeek >= 3,
    });
  }
  return items;
}

export function missionsDone(items: MissionItem[]): number {
  return items.filter((m) => m.done).length;
}

export interface ClassMissionInput {
  students: number;
  submitted: number;
  targetPct: number;
}

export interface ClassMissionState {
  targetPct: number;
  ratePct: number;
  submitted: number;
  students: number;
  achieved: boolean;
}

export function classMission(i: ClassMissionInput): ClassMissionState {
  const ratePct = i.students > 0 ? Math.round((i.submitted / i.students) * 100) : 0;
  return {
    targetPct: i.targetPct,
    ratePct,
    submitted: i.submitted,
    students: i.students,
    achieved: i.students > 0 && ratePct >= i.targetPct,
  };
}
