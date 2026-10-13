/**
 * 줄바꿈 점검용 가짜 API 응답 (scripts/linebreak-audit.mjs --fixtures)
 *  - 서버·DB·비밀번호 없이 화면을 채워 본다. 브라우저 안에서만 쓰이고 아무 데도 저장되지 않는다.
 *  - 줄바꿈이 잘 깨지는 값을 일부러 넣는다: 2글자·4글자 이름, (번호) 붙은 이름, 긴 제목, 칭호·등급 배지 여러 개.
 *  - 모양은 server/src/types/api.ts 를 따른다. 화면에 필요한 필드만 채운 곳도 있다.
 *  - 모든 문구는 존댓말(CLAUDE.md 규칙 9).
 */
import { URLSearchParams } from 'node:url';
const NOW = '2026-10-13T09:00:00+09:00';
const WEEK = '2026-W42';
const TITLES = [
  { code: 'streak7', emoji: '🔥', label: '꾸준한 출석왕' },
  { code: 'reporter', emoji: '📰', label: '꼬마 기자' },
  null,
];
const NAMES = ['류○은', '김○', '남궁○○민', '이○준(3)', '박○서', '최○우', '정○린', '한○'];
const TIERS = ['seed', 'sprout', 'flower', 'fruit', 'star'];

const author = (i) => ({
  displayName: NAMES[i % NAMES.length],
  className: `6-${(i % 8) + 1}`,
  grade: 6,
  tier: TIERS[i % TIERS.length],
  title: TITLES[i % TITLES.length],
  isReporter: i % 3 === 0,
});
const teacherAuthor = (i) => ({
  ...author(i),
  id: 100 + i,
  name: ['류다은', '김솔', '남궁하민', '이서준', '박지서', '최도우', '정아린', '한별'][i % 8],
  classId: (i % 8) + 1,
  studentNo: i + 1,
  parentConsent: i % 4 === 3 ? 'N' : 'Y',
});

const report = {
  avgMinutesPerDay: 95,
  topCategory: '동영상',
  topApp: '유튜브',
  prevAvgMinutes: 120,
  diffMinutes: -25,
  goalAchieved: true,
  goalReason: '저녁에 폰 대신 책을 읽었어요.',
};
const BODY =
  '이번 주 저는 동영상을 가장 많이 봤어요. 왜냐하면 친구들이 이야기하는 영상을 저도 보고 싶었기 때문이에요. ' +
  '다음 주에는 저녁 9시 이후에는 폰 대신 책을 읽어 보고 싶어요. 운동장에서 줄넘기도 해 볼 거예요.';

const studentPost = (i, type = i % 2 ? 'article' : 'report') => ({
  id: 500 + i,
  type,
  status: 'approved',
  visibility: 'school',
  title:
    type === 'article'
      ? [
          '토요 스포츠데이 배구 결승전 이야기',
          '도서관 책 읽기 주간에 만난 작가 선생님',
          '미술 시간에 만든 우리 반 벽화',
        ][i % 3]
      : null,
  body: BODY,
  goalText: '저녁 9시 이후에는 폰 안 보기',
  weekKey: WEEK,
  approvedAt: NOW,
  createdAt: NOW,
  likeCount: 12 + i,
  commentCount: 3,
  isMine: i === 0,
  author: author(i),
  images: [],
  report: type === 'report' ? report : null,
  article:
    type === 'article'
      ? {
          articleType: ['coverage', 'interview', 'review'][i % 3],
          tags: [['S', 'phonefree'], ['R'], ['A', 'R']][i % 3],
          oneLine: '친구들과 함께해서 정말 즐거웠어요.',
        }
      : null,
});
const myPost = (i, type) => ({
  ...studentPost(i, type),
  isMine: true,
  status: 'rejected',
  rejectReason: '캡처 화면과 적은 숫자가 달라요. 다시 확인해 주세요.',
  hiddenReason: null,
  submittedAt: NOW,
  prevGoalText: '하루 1시간만 쓰기',
});
const teacherPost = (i, status = 'pending') => {
  const p = studentPost(i);
  return {
    ...p,
    status,
    submittedAt: NOW,
    updatedAt: NOW,
    author: teacherAuthor(i),
    report: p.report ? { ...p.report, teacherScore: null } : null,
    article: p.article ? { ...p.article, isFeatured: false } : null,
    councilReview: {
      reviewerId: null,
      reviewedAt: NOW,
      result: i % 2 ? 'pass' : 'hold',
      checklist: null,
      note: i % 2 ? null : '존댓말이 아닌 문장이 있어요.',
    },
    reviewedBy: null,
    reviewedAt: null,
    rejectReason: null,
    hiddenReason: null,
    deletedAt: null,
  };
};
const comment = (i) => ({
  stance: i % 3 === 0 ? 'agree' : i % 3 === 1 ? 'disagree' : null,
  isBest: i === 0,
  id: 900 + i,
  body: [
    '저도 같은 생각이에요. 폰을 덜 쓰니 잠을 더 잘 잤어요.',
    '좋은 글 잘 읽었어요!',
    '다음에는 저도 해 볼게요.',
  ][i % 3],
  likeCount: i,
  likedByMe: false,
  isMine: i === 2,
  createdAt: NOW,
  author: author(i + 1),
});
const reactions = {
  likedByMe: false,
  likeCount: 14,
  comments: [0, 1, 2, 3].map(comment),
  myCommentCount: 1,
  goodCommentGuide: '친구의 글에서 좋은 점을 찾아 존댓말로 칭찬해 주세요.',
};
const votes = { agree: 31, disagree: 17, total: 48, agreePct: 65, disagreePct: 35 };
const topic = (i, status = 'live') => ({
  id: 70 + i,
  title: [
    '초등학생에게 스마트폰이 꼭 필요할까요?',
    '쉬는 시간에 운동장 사용 순서를 정해야 할까요?',
    '학급 문고에 만화책을 넣어도 될까요?',
  ][i % 3],
  type: i % 2 ? 'open' : 'vote',
  tags: ['RAS', '폰프리'],
  status,
  publishAt: NOW,
  closeAt: '2026-10-16T08:00:00+09:00',
  votes,
  commentCount: 8,
  myVote: i === 0 ? 'agree' : null,
});
const hallStudent = (i, teacher) => ({
  userId: 10 + i,
  displayName: NAMES[i % NAMES.length],
  className: `6-${(i % 8) + 1}`,
  grade: 6,
  gifted: i < 2,
  ...(teacher
    ? { name: teacherAuthor(i).name, studentNo: i + 1, rank: i + 1, points: 120 - i * 7 }
    : {}),
});
const classRow = (i) => ({
  classId: i + 1,
  className: `6-${i + 1}`,
  grade: 6,
  memberCount: 24,
  avgPoints: 48.5 - i,
  participationRate: 0.92 - i * 0.05,
});
const council = (i) => ({
  id: 300 + i,
  type: ['notice', 'promo', 'poll', 'report'][i % 4],
  title: [
    '10월 폰프리 챌린지 안내',
    '도서관 독서 골든벨에 참여해 주세요',
    '체육대회 응원 구호를 골라 주세요',
    '9월 자치회 활동 보고',
  ][i % 4],
  status: 'approved',
  startsAt: NOW,
  endsAt: '2026-10-20T23:59:00+09:00',
  isPinned: i === 0,
  isLive: true,
  likeCount: 5,
  commentCount: 2,
  authorLabel: '학생자치회 · 6-1 류○은(회장)',
  thumbnail: null,
  createdAt: NOW,
  approvedAt: NOW,
});
const councilDetail = (i) => ({
  ...council(i),
  body: '이번 주 금요일까지 응원 구호를 골라 주세요. 많이 고른 구호를 체육대회 날 다 함께 외쳐요.',
  images: [],
  allowComments: true,
  pinRequested: false,
  poll: {
    options: [
      { id: 1, label: '초롱초 화이팅, 끝까지 달려요!', votes: 21 },
      { id: 2, label: '함께라서 더 즐거워요', votes: 9 },
    ],
    myOptionId: null,
    totalVotes: 30,
    showBeforeClose: true,
    resultsVisible: true,
    canVote: true,
  },
  canEdit: false,
  rejectReason: null,
  reactions,
});
const mission = (code, emoji, label, current, target) => ({
  code,
  emoji,
  label,
  current,
  target,
  done: current >= target,
});
const classMission = {
  classId: 1,
  className: '6-1',
  weekKey: WEEK,
  targetPct: 80,
  ratePct: 62,
  submitted: 15,
  students: 24,
  achieved: false,
  achievedAt: null,
};

function me(role) {
  const teacher = role !== 'student';
  return {
    id: teacher ? 2 : 9,
    displayName: teacher ? '김선생' : '류○은',
    grade: teacher ? null : 6,
    className: teacher ? null : '6-1',
    tier: 'flower',
    title: teacher ? null : TITLES[0],
    isReporter: !teacher,
    isCouncil: !teacher,
    loginId: teacher ? 't2@ches.es.kr' : '266101',
    name: teacher ? '김선생' : '류다은',
    role: teacher ? 'admin' : 'student',
    isApprover: teacher,
    advisorGradeGroup: null,
    mustChangePw: false,
    parentConsent: 'Y',
    actingAs: null,
    hasCouncilAccount: false,
    demoSiteUrl: null,
  };
}

const ACH = [
  ['streak7', '🔥', '꾸준한 출석왕', '7일 연속 출석해요', true],
  ['reporter', '📰', '꼬마 기자', '기사 1편이 승인돼요', true],
  ['comment10', '💬', '다정한 댓글러', '좋은 댓글 10개', false],
  ['debate5', '🗣️', '토론 새싹', '토론 의견 5번', false],
  ['down', '📉', '사용시간 줄이기 성공', '지난주보다 줄여요', false],
  ['likes', '👍', '엄지척 부자', '엄지척 30개 받기', false],
];

/** pathname(+search) 에 맞는 data 를 돌려준다. 없으면 undefined (→ 404) */
export function fixtureFor(pathname, search, role) {
  const teacher = role !== 'student';
  const p = pathname.replace(/^\/api\/v1/, '');
  const qs = new URLSearchParams(search);
  let m;
  switch (true) {
    case p === '/me':
      return me(role);
    case p === '/me/home':
      return {
        me: me(role),
        weekKey: WEEK,
        weekPoints: 37,
        report: { status: 'rejected', postId: 500 },
        notifications: [
          {
            id: 1,
            type: 'post_approved',
            payload: {
              message: '리포트가 승인됐어요. 포인트 10점을 받았어요!',
              link: '/posts/500',
            },
            readAt: null,
            createdAt: NOW,
          },
          {
            id: 2,
            type: 'comment',
            payload: { message: '남궁○○민 친구가 내 글에 댓글을 달았어요.', link: '/posts/500' },
            readAt: NOW,
            createdAt: NOW,
          },
        ],
        notices: [
          {
            id: 1,
            title: '10월 폰프리 주간 안내',
            body: '이번 주는 폰프리 주간이에요. 쉬는 시간에 책 읽기와 운동장 놀이를 함께 해요.',
            startsAt: NOW,
            endsAt: NOW,
            isActive: true,
            authorName: '김선생',
          },
        ],
        debate: topic(0),
        councilPinned: [council(0), council(2)],
        missions: [
          mission('report', '📝', '폰프리 리포트 올리기', 1, 1),
          mission('comment', '💌', '친구 글에 좋은 댓글 3개', 1, 3),
          mission('debate', '💬', '토론방에 의견 남기기', 0, 1),
          mission('likes', '👍', '엄지척 5번 누르기', 4, 5),
        ],
        classMission,
      };
    case p.startsWith('/me/notifications'):
      return [];
    case p === '/me/attendance':
      return { days: 23, streak: 6, todayDone: true };
    case p === '/me/achievements':
      return {
        tier: {
          tier: 'flower',
          emoji: '🌸',
          label: '꽃',
          points: 412,
          next: { tier: 'fruit', emoji: '🍎', label: '열매', needed: 88, from: 300, to: 500 },
        },
        titleCode: 'streak7',
        attendanceStreak: 6,
        achievements: ACH.map(([code, emoji, label, hint, earned], i) => ({
          code,
          emoji,
          label,
          hint,
          earned,
          earnedAt: earned ? NOW : null,
          progress: earned ? null : { current: i, target: 10 },
          isTitle: i === 0,
        })),
      };
    case p === '/me/points':
      return {
        weekKey: WEEK,
        monthKey: '2026-10',
        week: 37,
        month: 142,
        all: 412,
        range: qs.get('range') ?? 'week',
        items: [
          ['REPORT_APPROVED', '폰프리 리포트 승인', 10, false, null],
          ['COMMENT_GOOD', '좋은 댓글', 2, false, null],
          ['TEACHER_BONUS', '선생님 칭찬', 5, false, '친구를 도와줘서 고마워요'],
          ['REPORT_APPROVED', '폰프리 리포트 승인 회수', -10, true, '글이 숨김 처리됐어요'],
          ['ATTENDANCE', '출석', 1, false, null],
        ].map(([ruleCode, ruleName, amount, isReversal, note], i) => ({
          id: i + 1,
          ruleCode,
          ruleName,
          amount,
          isReversal,
          note,
          refType: null,
          refId: null,
          grantedByName: ruleCode === 'TEACHER_BONUS' ? '김선생' : null,
          dayKey: '2026-10-13',
          weekKey: WEEK,
          createdAt: NOW,
        })),
      };
    case p === '/settings/public':
      return {
        captureGuide: {
          android_samsung: '설정 → 디지털 웰빙 및 자녀 보호 기능 → 주간 리포트 화면을 캡처해요.',
          iphone: '설정 → 스크린 타임 → 모든 활동 보기 화면을 캡처해요.',
          warning: '이름이나 전화번호가 보이지 않게 해 주세요.',
        },
        reportText: { reflection_min: 50, reflection_max: 800, goal_max: 60 },
        goodCommentGuide: reactions.goodCommentGuide,
      };
    case p === '/posts/week-context':
      return {
        currentWeekKey: WEEK,
        previousWeekKey: '2026-W41',
        defaultWeekKey: WEEK,
        existing: { [WEEK]: null, '2026-W41': { postId: 499, status: 'approved' } },
        canUseCapture: true,
        prevGoalText: '하루 1시간만 쓰기',
        prevAvgMinutes: 120,
        topCategories: ['동영상', '게임', 'SNS', '메신저', '웹툰·만화', '음악', '학습', '기타'],
        limits: { bodyMin: 50, bodyMax: 800, goalMax: 60, goalReasonMax: 200, topAppMax: 30 },
      };
    case p === '/posts/mine':
      return [myPost(0, 'report'), myPost(1, 'article')];
    case p === '/posts':
      return { items: [0, 1, 2, 3, 4, 5].map((i) => studentPost(i)), nextCursor: null };
    case /^\/posts\/\d+\/reactions$/.test(p):
      return reactions;
    case Boolean((m = p.match(/^\/posts\/(\d+)$/))):
      return teacher ? teacherPost(Number(m[1]) - 500) : studentPost(Number(m[1]) - 500);
    case p === '/news/topics':
      return {
        items:
          qs.get('status') === 'closed' ? [topic(1, 'closed'), topic(2, 'closed')] : [topic(0)],
        nextCursor: null,
      };
    case Boolean((m = p.match(/^\/news\/topics\/(\d+)$/))):
      return {
        ...topic(Number(m[1]) - 70),
        body: '요즘 많은 초등학생이 스마트폰을 가지고 있어요. 꼭 필요하다는 의견과 아직 이르다는 의견이 있어요. 여러분의 생각을 존댓말로 남겨 주세요.',
        questions: [
          '스마트폰이 있으면 좋은 점은 무엇인가요?',
          '스마트폰 때문에 생기는 걱정은 무엇인가요?',
        ],
        sourceUrl: null,
        canVote: true,
        canComment: true,
        helpers: ['저는 찬성해요. 왜냐하면 ', '저는 반대해요. 왜냐하면 ', '친구 의견에 덧붙이면 '],
        reactions,
        bestOpinions: [comment(0)],
      };
    case p === '/council/posts':
      return [0, 1, 2, 3].map(council);
    case Boolean((m = p.match(/^\/council\/posts\/(\d+)$/))):
      return councilDetail(Number(m[1]) - 300);
    case /^\/council\/posts\/\d+\/reactions$/.test(p):
      return reactions;
    case p === '/council/review/summary':
      return {
        hasAssignment: true,
        pending: 2,
        doneToday: 3,
        dailyCap: 10,
        allowedResults: 'pass_hold',
        grades: [5, 6],
        postTypes: ['report', 'article'],
        guide: '존댓말·바른 말을 썼는지, 친구 이름이나 사진이 없는지 확인해 주세요.',
        holdReasons: [
          { code: 'not_polite', text: '존댓말이 아닌 문장이 있어요' },
          { code: 'privacy', text: '친구 이름이나 얼굴이 보여요' },
        ],
      };
    case p === '/council/review/queue':
      return [0, 1].map((i) => ({ ...reviewerPost(i), checklist: CHECK }));
    case Boolean((m = p.match(/^\/council\/review\/posts\/(\d+)$/))):
      return { ...reviewerPost(Number(m[1]) - 600), checklist: CHECK };
    case p.startsWith('/hall-of-fame/weekly'):
      return {
        weekKey: WEEK,
        prevWeekKey: '2026-W41',
        nextWeekKey: null,
        showRank: teacher,
        perGrade: 5,
        grades: [
          { grade: 6, students: [0, 1, 2, 3, 4, 5, 6, 7].map((i) => hallStudent(i, teacher)) },
        ],
        classes: [0, 1, 2].map(classRow),
      };
    case p.startsWith('/hall-of-fame/monthly'):
      return {
        monthKey: '2026-09',
        prevMonthKey: '2026-08',
        nextMonthKey: '2026-10',
        confirmed: true,
        giftTargets: [{ grade: 6, students: [0, 1, 2, 3].map((i) => hallStudent(i, teacher)) }],
        growth: [
          {
            grade: 6,
            students: [4, 5].map((i) => ({ ...hallStudent(i, teacher), growthRate: 0.35 })),
          },
        ],
        awards: [
          {
            category: 'phonefree',
            label: '이 달의 폰프리 실천왕',
            grade: 6,
            student: hallStudent(2, teacher),
            reason: '한 달 동안 사용시간을 절반으로 줄였어요.',
          },
          {
            category: 'reporter',
            label: '이 달의 RAS 기자',
            grade: 6,
            student: hallStudent(3, teacher),
            reason: null,
          },
        ],
        winnerClass: classRow(0),
      };
    case p === '/hall-of-fame/classes':
      return {
        months: [
          { monthKey: '2026-09', ...classRow(0) },
          { monthKey: '2026-08', ...classRow(3) },
        ],
        latestWeek: { weekKey: WEEK, classes: [0, 1, 2, 3, 4, 5, 6, 7].map(classRow) },
      };
    case p === '/hall-of-fame/all-time':
      return {
        months: [
          {
            monthKey: '2026-09',
            awards: [
              {
                category: 'phonefree',
                label: '이 달의 폰프리 실천왕',
                grade: 6,
                student: hallStudent(2, teacher),
                reason: null,
              },
            ],
            giftCount: 8,
            winnerClass: classRow(0),
          },
        ],
      };
    case p === '/bug-reports/mine':
      return [];
    // ---------- 교사 ----------
    case p === '/teacher/classes' || p === '/admin/classes':
      return [0, 1, 2, 3, 4, 5, 6, 7].map((i) => ({
        id: i + 1,
        grade: 6,
        classNo: i + 1,
        name: `6-${i + 1}`,
        homeroomTeacherId: 2,
        homeroomTeacherName: '김선생',
        teacherIds: [2],
        studentCount: 24,
      }));
    case Boolean(p.match(/^\/teacher\/classes\/\d+\/dashboard$/)):
      return {
        classId: 1,
        className: '6-1',
        weekKey: WEEK,
        studentCount: 24,
        submitted: 15,
        submissionRate: 62,
        pending: { reviewed: 2, flagged: 1, pending: 4, escalated: 1, total: 8 },
        avgWeekPoints: 31.4,
        top5: [0, 1, 2, 3, 4].map((i) => ({
          userId: i,
          name: teacherAuthor(i).name,
          studentNo: i + 1,
          points: 60 - i * 5,
        })),
        nonParticipants: [5, 6, 7].map((i) => ({
          userId: i,
          name: teacherAuthor(i).name,
          studentNo: i + 1,
        })),
        classMission,
      };
    case p === '/teacher/pending-counts':
      return {
        total: 8,
        byClass: [
          { classId: 1, className: '6-1', reviewed: 2, flagged: 1, pending: 4, escalated: 1 },
        ],
      };
    case Boolean(p.match(/^\/teacher\/classes\/\d+\/pending$/)):
      return {
        classId: 1,
        approvalMode: 'two_step',
        autoEscalateHours: 48,
        escalatedIds: [501],
        counts: { reviewed: 2, flagged: 1, pending: 4, escalated: 1 },
        items: [0, 1, 2].map((i) => teacherPost(i, ['reviewed', 'flagged', 'pending'][i])),
      };
    case Boolean(p.match(/^\/teacher\/classes\/\d+\/posts$/)):
      return {
        items: [0, 1, 2, 3].map((i) => teacherPost(i, 'approved')),
        nextCursor: null,
        total: 4,
      };
    case Boolean(p.match(/^\/teacher\/classes\/\d+\/students$/)) || p === '/admin/students':
      return [0, 1, 2, 3, 4, 5, 6, 7].map((i) => ({
        ...author(i),
        id: 100 + i,
        displayName: NAMES[i],
        grade: 6,
        className: '6-1',
        isCouncil: i === 0,
        loginId: `26610${i + 1}`,
        name: teacherAuthor(i).name,
        role: 'student',
        classId: 1,
        studentNo: i + 1,
        parentConsent: i % 4 === 3 ? 'N' : 'Y',
        status: 'active',
        isApprover: false,
        advisorGradeGroup: null,
        mustChangePw: i % 3 === 0,
        lastLoginAt: NOW,
      }));
    case Boolean(p.match(/^\/teacher\/posts\/\d+\/comments$/)):
      return [];
    case Boolean(p.match(/^\/teacher\/posts\/\d+\/history$/)):
      return [];
    case p === '/teacher/comments':
      return {
        scope: 'class',
        scopeId: '1',
        items: [0, 1, 2].map((i) => ({
          id: 900 + i,
          body: comment(i).body,
          status: 'visible',
          likeCount: i,
          reportCount: i === 1 ? 2 : 0,
          bannedHits: i === 1 ? ['바보'] : [],
          createdAt: NOW,
          hiddenReason: null,
          author: {
            id: 100 + i,
            name: teacherAuthor(i).name,
            displayName: NAMES[i],
            classId: 1,
            className: '6-1',
            grade: 6,
            studentNo: i + 1,
          },
          target: {
            type: 'post',
            id: 500,
            postType: 'report',
            title: null,
            authorDisplayName: NAMES[i + 2],
          },
        })),
        nextCursor: null,
        total: 3,
        counts: { today: 3, unchecked: 2, lastCheckedAt: NOW, lastCheckedBy: '김선생' },
      };
    case p === '/teacher/reports':
      return [
        {
          id: 1,
          key: 'post:500',
          targetType: 'post',
          targetId: 500,
          targetKind: 'post_comment',
          postId: 500,
          commentId: 901,
          status: 'open',
          latestAt: NOW,
          reportCount: 2,
          reports: [
            {
              id: 1,
              reason: '나쁜 말이 있어요',
              createdAt: NOW,
              reporter: { displayName: NAMES[3], className: '6-2' },
            },
          ],
          target: {
            preview: '좋은 글 잘 읽었어요!',
            status: 'visible',
            authorName: '김솔',
            className: '6-1',
            postType: 'report',
          },
        },
      ];
    case p === '/teacher/news/closed':
      return [
        {
          id: 71,
          title: topic(1).title,
          type: 'vote',
          closeAt: NOW,
          votes,
          bestPerGrade: 3,
          grades: [
            {
              grade: 6,
              comments: [0, 1].map((i) => ({
                id: 900 + i,
                body: comment(i).body,
                likeCount: 3,
                authorName: teacherAuthor(i).name,
                className: '6-1',
                studentNo: i + 1,
                grade: 6,
                stance: 'agree',
                isBest: i === 0,
                canSelect: true,
              })),
            },
          ],
        },
      ];
    case p === '/admin/stats':
      return {
        weekKey: WEEK,
        monthKey: '2026-10',
        classes: [0, 1, 2, 3].map((i) => ({
          classId: i + 1,
          className: `6-${i + 1}`,
          grade: 6,
          students: 24,
          consentRate: 0.9,
          weekSubmissionRate: 0.6,
          monthParticipationRate: 0.8,
          avgMonthPoints: 120.5,
          newsVoters: 18,
          newsCommenters: 9,
        })),
        grades: [{ grade: 6, students: 192, weekSubmissionRate: 0.6, monthParticipationRate: 0.8 }],
        usageTrend: [
          { weekKey: '2026-W41', avgMinutes: 110, reports: 120 },
          { weekKey: WEEK, avgMinutes: 95, reports: 98 },
        ],
        activityTrend: [
          { weekKey: '2026-W41', posts: 130, comments: 300, likes: 800 },
          { weekKey: WEEK, posts: 101, comments: 240, likes: 610 },
        ],
      };
    case p.startsWith('/admin/council/posts'):
      return [0, 1].map((i) => ({
        ...councilDetail(i),
        status: i ? 'pending' : 'approved',
        authorName: '류다은',
        authorClassName: '6-1',
        submittedAt: NOW,
        approvedByName: i ? null : '김선생',
      }));
    case p === '/admin/council/members':
      return [0, 1].map((i) => ({
        id: i + 1,
        userId: 100 + i,
        name: teacherAuthor(i).name,
        displayName: NAMES[i],
        className: '6-1',
        grade: 6,
        studentNo: i + 1,
        title: i ? '부회장' : '회장',
        termStart: '2026-03-02',
        termEnd: null,
        isActive: true,
      }));
    case Boolean(p.match(/^\/admin\/weekly\/[^/]+\/gifts$/)):
      return {
        weekKey: WEEK,
        perGrade: 5,
        candidates: [0, 1, 2, 3].map((i) => ({
          userId: i,
          name: teacherAuthor(i).name,
          displayName: NAMES[i],
          className: `6-${i + 1}`,
          grade: 6,
          studentNo: i + 1,
          points: 60 - i * 4,
          rankInGrade: i + 1,
          gifted: i < 2,
          method: i < 2 ? 'top_n' : null,
        })),
        giftedCount: 2,
      };
    default:
      return undefined;
  }
}

const CHECK = [
  { code: 'polite', label: '존댓말로 썼어요' },
  { code: 'privacy', label: '친구 이름·얼굴이 없어요' },
  { code: 'kind', label: '바르고 고운 말이에요' },
];
function reviewerPost(i) {
  const p = studentPost(i);
  return {
    id: 600 + i,
    type: p.type,
    status: 'pending',
    authorGrade: 6,
    title: p.title,
    body: p.body,
    goalText: p.goalText,
    weekKey: WEEK,
    submittedAt: NOW,
    images: [],
    report: p.report,
    article: p.article,
  };
}
